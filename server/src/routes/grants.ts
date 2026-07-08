// ============================================================================
// Grants Routes
// Grant opportunities and proposal management
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateOpportunitySchema = z.object({
    name: z.string().min(1).max(500),
    agency: z.string().max(255).optional(),
    description: z.string().optional(),
    fundingAmountMin: z.number().int().nonnegative().optional(),
    fundingAmountMax: z.number().int().nonnegative().optional(),
    deadline: z.string().datetime().optional(),
    requirements: z.record(z.string(), z.any()).optional(),
    url: z.string().url().max(500).optional(),
    domain: z.string().max(100).optional(),
    status: z.enum(['open', 'closed', 'upcoming']).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

const UpdateOpportunitySchema = CreateOpportunitySchema.partial();

const CreateProposalSchema = z.object({
    opportunityId: z.string().uuid().optional(),
    title: z.string().min(1).max(500),
    abstract: z.string().optional(),
    content: z.record(z.string(), z.any()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

const UpdateProposalSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    abstract: z.string().optional(),
    content: z.record(z.string(), z.any()).optional(),
    status: z.enum(['draft', 'submitted', 'under_review', 'accepted', 'rejected']).optional(),
    result: z.enum(['funded', 'rejected', 'pending', 'withdrawn']).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// GET /grants/stats — Stats overview
// ============================================================================

router.get('/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const [openOpportunities, userProposals, upcomingDeadlines] = await Promise.all([
            query(
                `SELECT COUNT(*) as count FROM grant_opportunities WHERE status = 'open'`
            ),
            query(
                `SELECT status, COUNT(*) as count
                 FROM grant_proposals
                 WHERE user_id = $1
                 GROUP BY status`,
                [userId]
            ),
            query(
                `SELECT id, name, agency, deadline, domain
                 FROM grant_opportunities
                 WHERE status = 'open' AND deadline > NOW()
                 ORDER BY deadline ASC
                 LIMIT 5`
            ),
        ]);

        const proposalsByStatus: Record<string, number> = {};
        for (const row of userProposals.rows) {
            proposalsByStatus[row.status] = parseInt(row.count);
        }

        res.json({
            openOpportunities: parseInt(openOpportunities.rows[0].count),
            proposalsByStatus,
            upcomingDeadlines: upcomingDeadlines.rows,
        });
    } catch (error) {
        console.error('[Grants] Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch grant stats' });
    }
});

// ============================================================================
// GET /grants/opportunities — List opportunities (filterable)
// ============================================================================

router.get('/opportunities', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;

        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        const domain = req.query.domain as string;
        const agency = req.query.agency as string;
        const status = req.query.status as string;
        const deadline = req.query.deadline as string;

        if (domain) {
            conditions.push(`domain = $${paramIndex++}`);
            params.push(domain);
        }
        if (agency) {
            conditions.push(`agency ILIKE $${paramIndex++}`);
            params.push(`%${agency}%`);
        }
        if (status) {
            conditions.push(`status = $${paramIndex++}`);
            params.push(status);
        }
        if (deadline) {
            conditions.push(`deadline <= $${paramIndex++}`);
            params.push(deadline);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await query(
            `SELECT * FROM grant_opportunities
             ${whereClause}
             ORDER BY deadline ASC NULLS LAST, created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM grant_opportunities ${whereClause}`,
            params
        );

        res.json({
            opportunities: result.rows,
            pagination: {
                page, limit,
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
            },
        });
    } catch (error) {
        console.error('[Grants] List opportunities error:', error);
        res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
});

// ============================================================================
// POST /grants/opportunities — Create opportunity (admin only)
// ============================================================================

router.post('/opportunities', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateOpportunitySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const d = parsed.data;
        const result = await query(
            `INSERT INTO grant_opportunities
                (name, agency, description, funding_amount_min, funding_amount_max,
                 deadline, requirements, url, domain, status, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
                d.name,
                d.agency || null,
                d.description || null,
                d.fundingAmountMin || null,
                d.fundingAmountMax || null,
                d.deadline || null,
                JSON.stringify(d.requirements || {}),
                d.url || null,
                d.domain || null,
                d.status || 'open',
                JSON.stringify(d.metadata || {}),
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[Grants] Create opportunity error:', error);
        res.status(500).json({ error: 'Failed to create opportunity' });
    }
});

// ============================================================================
// GET /grants/opportunities/:id — Get opportunity detail
// ============================================================================

router.get('/opportunities/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT * FROM grant_opportunities WHERE id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Opportunity not found' });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Grants] Get opportunity error:', error);
        res.status(500).json({ error: 'Failed to fetch opportunity' });
    }
});

// ============================================================================
// PATCH /grants/opportunities/:id — Update opportunity
// ============================================================================

router.patch('/opportunities/:id', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateOpportunitySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const d = parsed.data;
        const fields: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (d.name !== undefined) { fields.push(`name = $${paramIndex++}`); params.push(d.name); }
        if (d.agency !== undefined) { fields.push(`agency = $${paramIndex++}`); params.push(d.agency); }
        if (d.description !== undefined) { fields.push(`description = $${paramIndex++}`); params.push(d.description); }
        if (d.fundingAmountMin !== undefined) { fields.push(`funding_amount_min = $${paramIndex++}`); params.push(d.fundingAmountMin); }
        if (d.fundingAmountMax !== undefined) { fields.push(`funding_amount_max = $${paramIndex++}`); params.push(d.fundingAmountMax); }
        if (d.deadline !== undefined) { fields.push(`deadline = $${paramIndex++}`); params.push(d.deadline); }
        if (d.requirements !== undefined) { fields.push(`requirements = $${paramIndex++}`); params.push(JSON.stringify(d.requirements)); }
        if (d.url !== undefined) { fields.push(`url = $${paramIndex++}`); params.push(d.url); }
        if (d.domain !== undefined) { fields.push(`domain = $${paramIndex++}`); params.push(d.domain); }
        if (d.status !== undefined) { fields.push(`status = $${paramIndex++}`); params.push(d.status); }
        if (d.metadata !== undefined) { fields.push(`metadata = $${paramIndex++}`); params.push(JSON.stringify(d.metadata)); }

        if (fields.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        params.push(req.params.id);
        const result = await query(
            `UPDATE grant_opportunities SET ${fields.join(', ')}
             WHERE id = $${paramIndex}
             RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Opportunity not found' });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Grants] Update opportunity error:', error);
        res.status(500).json({ error: 'Failed to update opportunity' });
    }
});

// ============================================================================
// DELETE /grants/opportunities/:id — Delete opportunity
// ============================================================================

router.delete('/opportunities/:id', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `DELETE FROM grant_opportunities WHERE id = $1 RETURNING id`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Opportunity not found' });
            return;
        }

        res.json({ message: 'Opportunity deleted' });
    } catch (error) {
        console.error('[Grants] Delete opportunity error:', error);
        res.status(500).json({ error: 'Failed to delete opportunity' });
    }
});

// ============================================================================
// GET /grants/proposals — List user's proposals
// ============================================================================

router.get('/proposals', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;

        const status = req.query.status as string;

        const conditions: string[] = ['p.user_id = $1'];
        const params: any[] = [userId];
        let paramIndex = 2;

        if (status) {
            conditions.push(`p.status = $${paramIndex++}`);
            params.push(status);
        }

        const whereClause = conditions.join(' AND ');

        const result = await query(
            `SELECT p.*,
                    go.name as opportunity_name,
                    go.agency as opportunity_agency,
                    go.deadline as opportunity_deadline,
                    go.domain as opportunity_domain
             FROM grant_proposals p
             LEFT JOIN grant_opportunities go ON go.id = p.opportunity_id
             WHERE ${whereClause}
             ORDER BY p.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM grant_proposals p WHERE ${whereClause}`,
            params
        );

        res.json({
            proposals: result.rows,
            pagination: {
                page, limit,
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
            },
        });
    } catch (error) {
        console.error('[Grants] List proposals error:', error);
        res.status(500).json({ error: 'Failed to fetch proposals' });
    }
});

// ============================================================================
// POST /grants/proposals — Create proposal
// ============================================================================

router.post('/proposals', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateProposalSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const d = parsed.data;
        const result = await query(
            `INSERT INTO grant_proposals
                (user_id, opportunity_id, title, abstract, content, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                req.user!.userId,
                d.opportunityId || null,
                d.title,
                d.abstract || null,
                JSON.stringify(d.content || {}),
                JSON.stringify(d.metadata || {}),
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[Grants] Create proposal error:', error);
        res.status(500).json({ error: 'Failed to create proposal' });
    }
});

// ============================================================================
// GET /grants/proposals/:id — Get proposal detail
// ============================================================================

router.get('/proposals/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT p.*,
                    go.name as opportunity_name,
                    go.agency as opportunity_agency,
                    go.deadline as opportunity_deadline,
                    go.domain as opportunity_domain,
                    go.funding_amount_min,
                    go.funding_amount_max
             FROM grant_proposals p
             LEFT JOIN grant_opportunities go ON go.id = p.opportunity_id
             WHERE p.id = $1 AND p.user_id = $2`,
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Proposal not found' });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Grants] Get proposal error:', error);
        res.status(500).json({ error: 'Failed to fetch proposal' });
    }
});

// ============================================================================
// PATCH /grants/proposals/:id — Update proposal
// ============================================================================

router.patch('/proposals/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateProposalSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const d = parsed.data;
        const fields: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (d.title !== undefined) { fields.push(`title = $${paramIndex++}`); params.push(d.title); }
        if (d.abstract !== undefined) { fields.push(`abstract = $${paramIndex++}`); params.push(d.abstract); }
        if (d.content !== undefined) { fields.push(`content = $${paramIndex++}`); params.push(JSON.stringify(d.content)); }
        if (d.status !== undefined) {
            fields.push(`status = $${paramIndex++}`);
            params.push(d.status);
            if (d.status === 'submitted') {
                fields.push(`submitted_at = NOW()`);
            }
        }
        if (d.result !== undefined) { fields.push(`result = $${paramIndex++}`); params.push(d.result); }
        if (d.metadata !== undefined) { fields.push(`metadata = $${paramIndex++}`); params.push(JSON.stringify(d.metadata)); }

        if (fields.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        fields.push(`updated_at = NOW()`);
        params.push(req.params.id, req.user!.userId);

        const result = await query(
            `UPDATE grant_proposals SET ${fields.join(', ')}
             WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
             RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Proposal not found' });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Grants] Update proposal error:', error);
        res.status(500).json({ error: 'Failed to update proposal' });
    }
});

// ============================================================================
// DELETE /grants/proposals/:id — Delete proposal
// ============================================================================

router.delete('/proposals/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `DELETE FROM grant_proposals WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Proposal not found' });
            return;
        }

        res.json({ message: 'Proposal deleted' });
    } catch (error) {
        console.error('[Grants] Delete proposal error:', error);
        res.status(500).json({ error: 'Failed to delete proposal' });
    }
});

export default router;
