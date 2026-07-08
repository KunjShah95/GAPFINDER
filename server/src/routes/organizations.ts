// ============================================================================
// Organizations Routes
// Institutional dashboards and team management
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';

const router = Router();

const CreateOrgSchema = z.object({
    name: z.string().min(2).max(255),
    description: z.string().max(1000).optional(),
    type: z.enum(['lab', 'university', 'company', 'research_institute']),
    website: z.string().url().optional(),
    settings: z.object({
        allowPublicView: z.boolean().optional(),
        requireApproval: z.boolean().optional()
    }).optional()
});

const UpdateMemberSchema = z.object({
    role: z.enum(['admin', 'editor', 'viewer'])
});

// ============================================================================
// GET /api/orgs — List user's organizations
// ============================================================================

router.get('/', requireAuth, requireFeature('organizations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `SELECT o.*, om.role as member_role, om.status as member_status,
                    (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id AND status = 'active') as member_count
             FROM organizations o
             JOIN organization_members om ON om.organization_id = o.id
             WHERE om.user_id = $1 AND om.status = 'active'
             ORDER BY o.created_at DESC`,
            [userId]
        );

        res.json({ organizations: result.rows });
    } catch (error) {
        console.error('[Orgs] List error:', error);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
});

// ============================================================================
// POST /api/orgs — Create organization
// ============================================================================

router.post('/', requireAuth, requireFeature('organizations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateOrgSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const userId = req.user!.userId;
        const { name, description, type, website, settings } = parsed.data;

        const result = await transaction(async (client) => {
            const orgResult = await client.query(
                `INSERT INTO organizations (name, description, type, website, settings, owner_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [name, description, type, website, JSON.stringify(settings || {}), userId]
            );

            const org = orgResult.rows[0];

            await client.query(
                `INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
                 VALUES ($1, $2, 'owner', 'active', NOW())`,
                [org.id, userId]
            );

            return org;
        });

        res.status(201).json({ organization: result });
    } catch (error) {
        console.error('[Orgs] Create error:', error);
        res.status(500).json({ error: 'Failed to create organization' });
    }
});

// ============================================================================
// GET /api/orgs/:id — Get organization details
// ============================================================================

router.get('/:id', requireAuth, requireFeature('organizations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        // Check membership
        const memberCheck = await query(
            `SELECT om.role, om.status, o.* 
             FROM organizations o
             JOIN organization_members om ON om.organization_id = o.id
             WHERE o.id = $1 AND om.user_id = $2 AND om.status = 'active'`,
            [req.params.id, userId]
        );

        if (memberCheck.rows.length === 0) {
            res.status(403).json({ error: 'Not a member of this organization' });
            return;
        }

        const org = memberCheck.rows[0];

        // Get member list
        const membersResult = await query(
            `SELECT om.id, om.role, om.status, om.joined_at, u.id as user_id, u.name, u.email, up.avatar_url, up.institution
             FROM organization_members om
             JOIN users u ON u.id = om.user_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE om.organization_id = $1 AND om.status = 'active'
             ORDER BY om.joined_at ASC`,
            [req.params.id]
        );

        res.json({ 
            organization: org, 
            members: membersResult.rows 
        });
    } catch (error) {
        console.error('[Orgs] Get error:', error);
        res.status(500).json({ error: 'Failed to fetch organization' });
    }
});

// ============================================================================
// GET /api/orgs/:id/dashboard — Get org analytics dashboard
// ============================================================================

router.get('/:id/dashboard', requireAuth, requireFeature('organizations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const period = req.query.period as string || '30';

        // Verify membership
        const memberCheck = await query(
            `SELECT role FROM organization_members 
             WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
            [req.params.id, userId]
        );

        if (memberCheck.rows.length === 0) {
            res.status(403).json({ error: 'Not a member of this organization' });
            return;
        }

        // Get aggregated stats
        const statsResult = await query(
            `SELECT 
                COUNT(DISTINCT p.id) as papers_analyzed,
                COUNT(DISTINCT g.id) as gaps_found,
                COUNT(DISTINCT g.id) FILTER (WHERE g.is_resolved = TRUE) as gaps_resolved,
                COUNT(DISTINCT om.user_id) as active_members,
                COUNT(DISTINCT pg.id) as shared_gaps
             FROM organization_members om
             JOIN users u ON u.id = om.user_id
             LEFT JOIN papers p ON p.user_id = om.user_id
             LEFT JOIN gaps g ON g.user_id = om.user_id
             LEFT JOIN public_gaps pg ON pg.user_id = om.user_id
             WHERE om.organization_id = $1 
                AND om.status = 'active'
                AND p.created_at > NOW() - INTERVAL '${period} days'
                AND g.created_at > NOW() - INTERVAL '${period} days'`,
            [req.params.id]
        );

        // Get recent activity
        const activityResult = await query(
            `SELECT 
                'paper' as type, p.title, p.created_at as timestamp
             FROM organization_members om
             JOIN papers p ON p.user_id = om.user_id
             WHERE om.organization_id = $1 AND om.status = 'active'
             ORDER BY p.created_at DESC
             LIMIT 10
            
             UNION ALL
             
             SELECT 
                'gap' as type, g.problem as title, g.created_at as timestamp
             FROM organization_members om
             JOIN gaps g ON g.user_id = om.user_id
             WHERE om.organization_id = $1 AND om.status = 'active'
             ORDER BY timestamp DESC
             LIMIT 10`,
            [req.params.id]
        );

        res.json({ 
            stats: statsResult.rows[0],
            recentActivity: activityResult.rows
        });
    } catch (error) {
        console.error('[Orgs] Dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
});

// ============================================================================
// GET /api/orgs/:id/gaps — Get all gaps from org members
// ============================================================================

router.get('/:id/gaps', requireAuth, requireFeature('organizations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;

        // Verify membership
        const memberCheck = await query(
            `SELECT role FROM organization_members 
             WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
            [req.params.id, userId]
        );

        if (memberCheck.rows.length === 0) {
            res.status(403).json({ error: 'Not a member of this organization' });
            return;
        }

        const result = await query(
            `SELECT g.*, u.name as author_name, up.avatar_url, p.title as paper_title
             FROM organization_members om
             JOIN gaps g ON g.user_id = om.user_id
             JOIN users u ON u.id = g.user_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             JOIN papers p ON p.id = g.paper_id
             WHERE om.organization_id = $1 AND om.status = 'active'
             ORDER BY g.created_at DESC
             LIMIT $2 OFFSET $3`,
            [req.params.id, limit, offset]
        );

        res.json({ gaps: result.rows, pagination: { page, limit } });
    } catch (error) {
        console.error('[Orgs] Gaps error:', error);
        res.status(500).json({ error: 'Failed to fetch organization gaps' });
    }
});

// ============================================================================
// DELETE /api/orgs/:id/members/:userId — Remove member
// ============================================================================

router.delete('/:id/members/:userId', requireAuth, requireFeature('organizations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        // Check if requester is admin or owner
        const memberCheck = await query(
            `SELECT role FROM organization_members 
             WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
            [req.params.id, userId]
        );

        if (memberCheck.rows.length === 0 || !['owner', 'admin'].includes(memberCheck.rows[0].role)) {
            res.status(403).json({ error: 'Only admins can remove members' });
            return;
        }

        // Cannot remove owner
        if (memberCheck.rows[0].role === 'owner' && req.params.userId === userId) {
            res.status(400).json({ error: 'Cannot remove yourself as owner' });
            return;
        }

        await query(
            `DELETE FROM organization_members 
             WHERE organization_id = $1 AND user_id = $2`,
            [req.params.id, req.params.userId]
        );

        res.json({ message: 'Member removed' });
    } catch (error) {
        console.error('[Orgs] Remove member error:', error);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

// ============================================================================
// DELETE /api/orgs/:id — Delete organization
// ============================================================================

router.delete('/:id', requireAuth, requireFeature('organizations'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        // Check if owner
        const ownerCheck = await query(
            `DELETE FROM organizations 
             WHERE id = $1 AND owner_id = $2
             RETURNING id`,
            [req.params.id, userId]
        );

        if (ownerCheck.rows.length === 0) {
            res.status(403).json({ error: 'Only owner can delete organization' });
            return;
        }

        res.json({ message: 'Organization deleted' });
    } catch (error) {
        console.error('[Orgs] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete organization' });
    }
});

export default router;
