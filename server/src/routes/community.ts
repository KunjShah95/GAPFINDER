// ============================================================================
// Community Routes
// Gap sharing, following, and community features
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const ShareGapSchema = z.object({
    gapId: z.string().uuid(),
    shareReason: z.string().min(10).max(1000)
});

const FollowUserSchema = z.object({
    userId: z.string().uuid()
});

const UpdateProfileSchema = z.object({
    bio: z.string().max(500).optional(),
    institution: z.string().max(255).optional(),
    avatarUrl: z.string().url().optional(),
    website: z.string().url().optional(),
    github: z.string().max(100).optional(),
    twitter: z.string().max(100).optional(),
    linkedin: z.string().max(100).optional(),
    isPublic: z.boolean().optional()
});

// ============================================================================
// POST /api/community/gaps — Share a gap to community
// ============================================================================

router.post('/gaps', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = ShareGapSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { gapId, shareReason } = parsed.data;
        const userId = req.user!.userId;

        // Verify gap belongs to user
        const gapCheck = await query(
            'SELECT id, problem, type FROM gaps WHERE id = $1 AND user_id = $2',
            [gapId, userId]
        );

        if (gapCheck.rows.length === 0) {
            res.status(404).json({ error: 'Gap not found or not owned by user' });
            return;
        }

        const result = await transaction(async (client) => {
            // Check if already shared
            const existing = await client.query(
                'SELECT id FROM public_gaps WHERE gap_id = $1',
                [gapId]
            );

            if (existing.rows.length > 0) {
                await client.query(
                    `UPDATE public_gaps SET share_reason = $1, created_at = NOW()
                     WHERE gap_id = $2`,
                    [shareReason, gapId]
                );
                return existing.rows[0];
            }

            const insertResult = await client.query(
                `INSERT INTO public_gaps (user_id, gap_id, share_reason)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [userId, gapId, shareReason]
            );

            // Update user profile stats
            await client.query(
                `UPDATE user_profiles 
                 SET total_shared_gaps = total_shared_gaps + 1
                 WHERE user_id = $1`,
                [userId]
            );

            return insertResult.rows[0];
        });

        res.status(201).json({ publicGap: result, message: 'Gap shared to community' });
    } catch (error) {
        console.error('[Community] Share gap error:', error);
        res.status(500).json({ error: 'Failed to share gap' });
    }
});

// ============================================================================
// DELETE /api/community/gaps/:id — Unshare a gap
// ============================================================================

router.delete('/gaps/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `DELETE FROM public_gaps 
             WHERE id = $1 AND user_id = $2 
             RETURNING id`,
            [req.params.id, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Shared gap not found' });
            return;
        }

        res.json({ message: 'Gap unshared from community' });
    } catch (error) {
        console.error('[Community] Unshare error:', error);
        res.status(500).json({ error: 'Failed to unshare gap' });
    }
});

// ============================================================================
// GET /api/community/gaps — Browse community gaps (public)
// ============================================================================

router.get('/gaps', async (req: Request, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;
        const type = req.query.type as string;
        const impact = req.query.impact as string;
        const sort = req.query.sort as string || 'upvotes';

        let orderBy = 'pg.upvotes DESC, pg.created_at DESC';
        if (sort === 'recent') orderBy = 'pg.created_at DESC';
        if (sort === 'views') orderBy = 'pg.view_count DESC';

        const conditions: string[] = ['pg.id IS NOT NULL'];
        const params: any[] = [];
        let paramIndex = 1;

        if (type) {
            conditions.push(`g.type = $${paramIndex++}`);
            params.push(type);
        }
        if (impact) {
            conditions.push(`g.impact_score = $${paramIndex++}`);
            params.push(impact);
        }

        const whereClause = conditions.join(' AND ');

        const result = await query(
            `SELECT pg.*, g.problem, g.type, g.confidence, g.impact_score, g.difficulty,
                    p.title as paper_title, p.url as paper_url, p.venue, p.year,
                    u.name as author_name, up.avatar_url, up.institution
             FROM public_gaps pg
             JOIN gaps g ON g.id = pg.gap_id
             JOIN papers p ON p.id = g.paper_id
             JOIN users u ON u.id = pg.user_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE ${whereClause}
             ORDER BY ${orderBy}
             LIMIT $${paramIndex++} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        res.json({ gaps: result.rows, pagination: { page, limit } });
    } catch (error) {
        console.error('[Community] Browse gaps error:', error);
        res.status(500).json({ error: 'Failed to fetch gaps' });
    }
});

// ============================================================================
// GET /api/community/leaderboard — Get leaderboard
// ============================================================================

router.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
    try {
        const period = req.query.period as string || 'all_time';
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

        let dateFilter = '';
        if (period === 'weekly') {
            dateFilter = "AND pg.created_at > NOW() - INTERVAL '7 days'";
        } else if (period === 'monthly') {
            dateFilter = "AND pg.created_at > NOW() - INTERVAL '30 days'";
        }

        const result = await query(
            `SELECT u.id as user_id, u.name, up.avatar_url, up.institution,
                    COUNT(pg.id) as shared_gaps,
                    COALESCE(SUM(pg.upvotes), 0) as total_upvotes,
                    COALESCE(SUM(pg.view_count), 0) as total_views
             FROM users u
             LEFT JOIN public_gaps pg ON pg.user_id = u.id ${dateFilter}
             LEFT JOIN user_profiles up ON up.user_id = u.id
             GROUP BY u.id, u.name, up.avatar_url, up.institution
             HAVING COUNT(pg.id) > 0
             ORDER BY total_upvotes DESC
             LIMIT $1`,
            [limit]
        );

        const leaderboard = result.rows.map((row: any, index: number) => ({
            rank: index + 1,
            ...row
        }));

        res.json({ leaderboard, period });
    } catch (error) {
        console.error('[Community] Leaderboard error:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// ============================================================================
// POST /api/community/follow/:userId — Follow a user
// ============================================================================

router.post('/follow/:userId', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const followerId = req.user!.userId;
        const followingId = req.params.userId;

        if (followerId === followingId) {
            res.status(400).json({ error: 'Cannot follow yourself' });
            return;
        }

        await query(
            `INSERT INTO user_follows (follower_id, following_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [followerId, followingId]
        );

        res.json({ message: 'Following user' });
    } catch (error) {
        console.error('[Community] Follow error:', error);
        res.status(500).json({ error: 'Failed to follow user' });
    }
});

// ============================================================================
// DELETE /api/community/follow/:userId — Unfollow a user
// ============================================================================

router.delete('/follow/:userId', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const followerId = req.user!.userId;
        const followingId = req.params.userId;

        await query(
            `DELETE FROM user_follows 
             WHERE follower_id = $1 AND following_id = $2`,
            [followerId, followingId]
        );

        res.json({ message: 'Unfollowed user' });
    } catch (error) {
        console.error('[Community] Unfollow error:', error);
        res.status(500).json({ error: 'Failed to unfollow user' });
    }
});

// ============================================================================
// GET /api/community/following — Get followed users
// ============================================================================

router.get('/following', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `SELECT u.id, u.name, up.avatar_url, up.institution, uf.created_at as followed_at
             FROM user_follows uf
             JOIN users u ON u.id = uf.following_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE uf.follower_id = $1
             ORDER BY uf.created_at DESC`,
            [userId]
        );

        res.json({ following: result.rows });
    } catch (error) {
        console.error('[Community] Following error:', error);
        res.status(500).json({ error: 'Failed to fetch following' });
    }
});

// ============================================================================
// GET /api/community/users/:id — Get user profile
// ============================================================================

router.get('/users/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT u.id, u.name, u.email, up.bio, up.institution, up.avatar_url,
                    up.website, up.github, up.twitter, up.linkedin,
                    up.total_shared_gaps, up.total_upvotes_received,
                    (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count,
                    (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) as following_count
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error('[Community] User profile error:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// ============================================================================
// PUT /api/community/profile — Update own profile
// ============================================================================

router.put('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateProfileSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const userId = req.user!.userId;
        const data = parsed.data;

        // Upsert profile
        await query(
            `INSERT INTO user_profiles (user_id, bio, institution, avatar_url, website, github, twitter, linkedin, is_public)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (user_id) DO UPDATE SET
                bio = COALESCE($2, user_profiles.bio),
                institution = COALESCE($3, user_profiles.institution),
                avatar_url = COALESCE($4, user_profiles.avatar_url),
                website = COALESCE($5, user_profiles.website),
                github = COALESCE($6, user_profiles.github),
                twitter = COALESCE($7, user_profiles.twitter),
                linkedin = COALESCE($8, user_profiles.linkedin),
                is_public = COALESCE($9, user_profiles.is_public),
                updated_at = NOW()`,
            [userId, data.bio, data.institution, data.avatarUrl, data.website, 
             data.github, data.twitter, data.linkedin, data.isPublic]
        );

        res.json({ message: 'Profile updated' });
    } catch (error) {
        console.error('[Community] Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ============================================================================
// GET /api/community/profile — Get own profile
// ============================================================================

router.get('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `SELECT u.id, u.name, u.email, up.bio, up.institution, up.avatar_url,
                    up.website, up.github, up.twitter, up.linkedin, up.is_public,
                    up.total_shared_gaps, up.total_upvotes_received,
                    (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count,
                    (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) as following_count
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [userId]
        );

        res.json({ profile: result.rows[0] });
    } catch (error) {
        console.error('[Community] Get profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

export default router;
