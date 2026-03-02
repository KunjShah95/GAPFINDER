// ============================================================================
// Activity Log Routes
// User activity tracking, audit trail, and activity feed
// ============================================================================

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

// ============================================================================
// GET /activity — User's activity feed
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;
        const filterType = req.query.type as string;

        let typeFilter = '';
        const params: any[] = [userId, limit, offset];

        if (filterType) {
            typeFilter = `AND action_type = $4`;
            params.push(filterType);
        }

        // Build a unified timeline from multiple tables
        const result = await query(
            `(SELECT 'paper_added' as action_type, 
                     p.title as subject, 
                     p.id as entity_id,
                     'paper' as entity_type,
                     json_build_object('url', p.url, 'venue', p.venue, 'year', p.year) as metadata,
                     p.created_at as timestamp
              FROM papers p WHERE p.user_id = $1)
             UNION ALL
             (SELECT 'gap_found' as action_type,
                     LEFT(g.problem, 100) as subject,
                     g.id as entity_id,
                     'gap' as entity_type,
                     json_build_object('type', g.type, 'impact', g.impact_score, 'paper_id', g.paper_id) as metadata,
                     g.created_at as timestamp
              FROM gaps g WHERE g.user_id = $1)
             UNION ALL
             (SELECT 'gap_resolved' as action_type,
                     LEFT(g.problem, 100) as subject,
                     g.id as entity_id,
                     'gap' as entity_type,
                     json_build_object('resolved_by', g.resolved_by) as metadata,
                     g.resolved_at as timestamp
              FROM gaps g WHERE g.user_id = $1 AND g.is_resolved = TRUE AND g.resolved_at IS NOT NULL)
             UNION ALL
             (SELECT 'gap_shared' as action_type,
                     LEFT(g.problem, 100) as subject,
                     pg.id as entity_id,
                     'public_gap' as entity_type,
                     json_build_object('share_reason', pg.share_reason) as metadata,
                     pg.created_at as timestamp
              FROM public_gaps pg
              JOIN gaps g ON g.id = pg.gap_id
              WHERE pg.user_id = $1)
             UNION ALL
             (SELECT 'collection_created' as action_type,
                     c.name as subject,
                     c.id as entity_id,
                     'collection' as entity_type,
                     json_build_object('color', c.color, 'description', c.description) as metadata,
                     c.created_at as timestamp
              FROM collections c WHERE c.user_id = $1)
             UNION ALL
             (SELECT 'comment_posted' as action_type,
                     LEFT(cm.text, 100) as subject,
                     cm.id as entity_id,
                     cm.document_type as entity_type,
                     json_build_object('document_id', cm.document_id) as metadata,
                     cm.created_at as timestamp
              FROM comments cm WHERE cm.user_id = $1)
             UNION ALL
             (SELECT 'user_followed' as action_type,
                     u.name as subject,
                     uf.following_id as entity_id,
                     'user' as entity_type,
                     json_build_object('user_email', u.email) as metadata,
                     uf.created_at as timestamp
              FROM user_follows uf
              JOIN users u ON u.id = uf.following_id
              WHERE uf.follower_id = $1)
             UNION ALL
             (SELECT 'achievement_unlocked' as action_type,
                     a.name as subject,
                     a.id as entity_id,
                     'achievement' as entity_type,
                     json_build_object('tier', a.tier, 'description', a.description) as metadata,
                     a.unlocked_at as timestamp
              FROM achievements a WHERE a.user_id = $1)
             ORDER BY timestamp DESC
             LIMIT $2 OFFSET $3`,
            params
        );

        res.json({
            activities: result.rows,
            pagination: { page, limit },
        });
    } catch (error) {
        console.error('[Activity] Feed error:', error);
        res.status(500).json({ error: 'Failed to fetch activity feed' });
    }
});

// ============================================================================
// GET /activity/stats — Activity heatmap data (GitHub-style)
// ============================================================================

router.get('/heatmap', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const months = parseInt(req.query.months as string) || 12;

        const result = await query(
            `SELECT activity_date, SUM(activity_count) as count FROM (
                (SELECT created_at::date as activity_date, COUNT(*) as activity_count
                 FROM papers WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${months} months'
                 GROUP BY activity_date)
                UNION ALL
                (SELECT created_at::date as activity_date, COUNT(*) as activity_count
                 FROM gaps WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${months} months'
                 GROUP BY activity_date)
                UNION ALL
                (SELECT created_at::date as activity_date, COUNT(*) as activity_count
                 FROM comments WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${months} months'
                 GROUP BY activity_date)
             ) combined
             GROUP BY activity_date
             ORDER BY activity_date`,
            [userId]
        );

        // Calculate stats
        const totalDays = result.rows.length;
        const totalActivities = result.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
        const maxDay = result.rows.reduce((max, r) => Math.max(max, parseInt(r.count)), 0);

        res.json({
            heatmap: result.rows.map(r => ({
                date: r.activity_date,
                count: parseInt(r.count),
                // Intensity level 0-4 for coloring
                level: Math.min(4, Math.ceil((parseInt(r.count) / Math.max(maxDay, 1)) * 4)),
            })),
            stats: {
                activeDays: totalDays,
                totalActivities,
                busiestDay: maxDay,
                period: `${months} months`,
            },
        });
    } catch (error) {
        console.error('[Activity] Heatmap error:', error);
        res.status(500).json({ error: 'Failed to fetch activity heatmap' });
    }
});

// ============================================================================
// GET /activity/following — Feed from followed users
// ============================================================================

router.get('/following', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const offset = (page - 1) * limit;

        const result = await query(
            `SELECT 
                'gap_shared' as action_type,
                u.name as user_name,
                u.avatar,
                LEFT(g.problem, 100) as subject,
                g.type as gap_type,
                g.impact_score,
                pg.upvotes,
                pg.created_at as timestamp
             FROM user_follows uf
             JOIN public_gaps pg ON pg.user_id = uf.following_id
             JOIN gaps g ON g.id = pg.gap_id
             JOIN users u ON u.id = uf.following_id
             WHERE uf.follower_id = $1
             ORDER BY pg.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        res.json({
            feed: result.rows,
            pagination: { page, limit },
        });
    } catch (error) {
        console.error('[Activity] Following feed error:', error);
        res.status(500).json({ error: 'Failed to fetch following feed' });
    }
});

// ============================================================================
// GET /activity/usage — Usage record summary for billing
// ============================================================================

router.get('/usage', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const [current, history] = await Promise.all([
            query(
                `SELECT * FROM usage_records
                 WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()
                 ORDER BY period_start DESC LIMIT 1`,
                [userId]
            ),
            query(
                `SELECT period_start, period_end, papers_processed, gaps_extracted, 
                        api_calls, export_count
                 FROM usage_records
                 WHERE user_id = $1
                 ORDER BY period_start DESC
                 LIMIT 12`,
                [userId]
            ),
        ]);

        res.json({
            currentPeriod: current.rows[0] || null,
            history: history.rows,
        });
    } catch (error) {
        console.error('[Activity] Usage error:', error);
        res.status(500).json({ error: 'Failed to fetch usage data' });
    }
});

export default router;
