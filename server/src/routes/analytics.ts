// ============================================================================
// Analytics Routes
// Advanced analytics, trend analysis, and personalized insights
// ============================================================================

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

// ============================================================================
// GET /analytics/overview — Comprehensive dashboard analytics
// ============================================================================

router.get('/overview', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const period = parseInt(req.query.period as string) || 30; // days

        // Run all queries in parallel for performance
        const [papersStats, gapsStats, activityTimeline, topVenues, recentActivity] = await Promise.all([
            // Papers statistics
            query(
                `SELECT 
                    COUNT(*) as total_papers,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${period} days') as papers_this_period,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as papers_this_week,
                    COUNT(DISTINCT venue) as unique_venues,
                    AVG(citation_count)::integer as avg_citations,
                    MAX(citation_count) as max_citations
                 FROM papers WHERE user_id = $1`,
                [userId]
            ),

            // Gaps statistics
            query(
                `SELECT 
                    COUNT(*) as total_gaps,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${period} days') as gaps_this_period,
                    COUNT(*) FILTER (WHERE is_resolved = TRUE) as resolved_gaps,
                    COUNT(*) FILTER (WHERE impact_score = 'high') as high_impact_gaps,
                    AVG(confidence)::numeric(3,2) as avg_confidence,
                    json_object_agg(type, cnt) as type_distribution
                 FROM (
                    SELECT type, COUNT(*) as cnt FROM gaps WHERE user_id = $1 GROUP BY type
                 ) sub, (
                    SELECT COUNT(*) as total_gaps,
                           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${period} days') as gaps_this_period,
                           COUNT(*) FILTER (WHERE is_resolved = TRUE) as resolved_gaps,
                           COUNT(*) FILTER (WHERE impact_score = 'high') as high_impact_gaps,
                           AVG(confidence)::numeric(3,2) as avg_confidence
                    FROM gaps WHERE user_id = $1
                 ) stats`,
                [userId]
            ).catch(() => ({ rows: [{}] })),

            // Activity timeline (papers + gaps per day)
            query(
                `SELECT date_trunc('day', created_at)::date as day,
                        'paper' as entity_type,
                        COUNT(*) as count
                 FROM papers WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${period} days'
                 GROUP BY day
                 UNION ALL
                 SELECT date_trunc('day', created_at)::date as day,
                        'gap' as entity_type,
                        COUNT(*) as count
                 FROM gaps WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${period} days'
                 GROUP BY day
                 ORDER BY day`,
                [userId]
            ),

            // Top venues
            query(
                `SELECT venue, COUNT(*) as paper_count, 
                        COUNT(DISTINCT g.id) as gap_count
                 FROM papers p
                 LEFT JOIN gaps g ON g.paper_id = p.id
                 WHERE p.user_id = $1 AND p.venue IS NOT NULL
                 GROUP BY venue
                 ORDER BY paper_count DESC
                 LIMIT 10`,
                [userId]
            ),

            // Recent activity feed
            query(
                `(SELECT 'paper_added' as action, p.title as subject, p.created_at as timestamp
                  FROM papers p WHERE p.user_id = $1
                  ORDER BY p.created_at DESC LIMIT 5)
                 UNION ALL
                 (SELECT 'gap_found' as action, g.problem as subject, g.created_at as timestamp
                  FROM gaps g WHERE g.user_id = $1
                  ORDER BY g.created_at DESC LIMIT 5)
                 UNION ALL
                 (SELECT 'gap_resolved' as action, g.problem as subject, g.resolved_at as timestamp
                  FROM gaps g WHERE g.user_id = $1 AND g.is_resolved = TRUE
                  ORDER BY g.resolved_at DESC LIMIT 5)
                 ORDER BY timestamp DESC
                 LIMIT 15`,
                [userId]
            ),
        ]);

        res.json({
            papers: papersStats.rows[0] || {},
            gaps: gapsStats.rows[0] || {},
            timeline: activityTimeline.rows,
            topVenues: topVenues.rows,
            recentActivity: recentActivity.rows,
            period,
        });
    } catch (error) {
        console.error('[Analytics] Overview error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// ============================================================================
// GET /analytics/trends — Gap trend analysis over time
// ============================================================================

router.get('/trends', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const groupBy = (req.query.groupBy as string) || 'week'; // day, week, month
        const months = parseInt(req.query.months as string) || 6;

        let truncFn: string;
        switch (groupBy) {
            case 'day': truncFn = 'day'; break;
            case 'month': truncFn = 'month'; break;
            default: truncFn = 'week'; break;
        }

        const result = await query(
            `SELECT date_trunc('${truncFn}', g.created_at)::date as period,
                    COUNT(*) as total_gaps,
                    COUNT(*) FILTER (WHERE g.type = 'data') as data_gaps,
                    COUNT(*) FILTER (WHERE g.type = 'compute') as compute_gaps,
                    COUNT(*) FILTER (WHERE g.type = 'evaluation') as evaluation_gaps,
                    COUNT(*) FILTER (WHERE g.type = 'theory') as theory_gaps,
                    COUNT(*) FILTER (WHERE g.type = 'methodology') as methodology_gaps,
                    COUNT(*) FILTER (WHERE g.type = 'deployment') as deployment_gaps,
                    COUNT(*) FILTER (WHERE g.impact_score = 'high') as high_impact,
                    AVG(g.confidence)::numeric(3,2) as avg_confidence
             FROM gaps g
             WHERE g.user_id = $1 AND g.created_at > NOW() - INTERVAL '${months} months'
             GROUP BY period
             ORDER BY period`,
            [userId]
        );

        res.json({ trends: result.rows, groupBy, months });
    } catch (error) {
        console.error('[Analytics] Trends error:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

// ============================================================================
// GET /analytics/research-velocity — How fast user is finding gaps
// ============================================================================

router.get('/research-velocity', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `WITH weekly_stats AS (
                SELECT date_trunc('week', created_at)::date as week,
                       COUNT(*) as gaps_found
                FROM gaps
                WHERE user_id = $1 AND created_at > NOW() - INTERVAL '12 weeks'
                GROUP BY week
                ORDER BY week
            )
            SELECT 
                week,
                gaps_found,
                AVG(gaps_found) OVER (ORDER BY week ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)::numeric(5,1) as rolling_avg,
                CASE 
                    WHEN LAG(gaps_found) OVER (ORDER BY week) > 0 
                    THEN ((gaps_found::decimal - LAG(gaps_found) OVER (ORDER BY week)) / LAG(gaps_found) OVER (ORDER BY week) * 100)::numeric(5,1)
                    ELSE 0 
                END as growth_pct
            FROM weekly_stats`,
            [userId]
        );

        // Calculate overall velocity (gaps per week average)
        const totalResult = await query(
            `SELECT 
                COUNT(*)::decimal / GREATEST(1, EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 604800)
                    as gaps_per_week
             FROM gaps WHERE user_id = $1`,
            [userId]
        );

        res.json({
            weekly: result.rows,
            overallVelocity: parseFloat(totalResult.rows[0]?.gaps_per_week || '0').toFixed(1),
        });
    } catch (error) {
        console.error('[Analytics] Velocity error:', error);
        res.status(500).json({ error: 'Failed to fetch velocity' });
    }
});

// ============================================================================
// GET /analytics/gap-landscape — AI-enriched gap category landscape
// ============================================================================

router.get('/gap-landscape', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `SELECT g.type, g.impact_score, g.difficulty,
                    COUNT(*) as count,
                    AVG(g.confidence)::numeric(3,2) as avg_confidence,
                    COUNT(*) FILTER (WHERE g.is_resolved) as resolved,
                    json_agg(json_build_object(
                        'id', g.id,
                        'problem', LEFT(g.problem, 100),
                        'upvotes', g.upvotes
                    ) ORDER BY g.upvotes DESC) FILTER (WHERE g.upvotes > 0) as top_voted
             FROM gaps g
             WHERE g.user_id = $1
             GROUP BY g.type, g.impact_score, g.difficulty
             ORDER BY count DESC`,
            [userId]
        );

        res.json({ landscape: result.rows });
    } catch (error) {
        console.error('[Analytics] Landscape error:', error);
        res.status(500).json({ error: 'Failed to fetch gap landscape' });
    }
});

// ============================================================================
// GET /analytics/collaboration-stats — Community engagement metrics
// ============================================================================

router.get('/collaboration-stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const [sharedGaps, followers, following, votes] = await Promise.all([
            query(
                `SELECT COUNT(*) as total_shared,
                        COALESCE(SUM(upvotes), 0) as total_upvotes,
                        COALESCE(SUM(view_count), 0) as total_views
                 FROM public_gaps WHERE user_id = $1`,
                [userId]
            ),
            query(
                `SELECT COUNT(*) as count FROM user_follows WHERE following_id = $1`,
                [userId]
            ),
            query(
                `SELECT COUNT(*) as count FROM user_follows WHERE follower_id = $1`,
                [userId]
            ),
            query(
                `SELECT COUNT(*) as votes_given FROM gap_votes WHERE user_id = $1`,
                [userId]
            ),
        ]);

        res.json({
            sharedGaps: sharedGaps.rows[0],
            followers: parseInt(followers.rows[0].count),
            following: parseInt(following.rows[0].count),
            votesGiven: parseInt(votes.rows[0].votes_given),
        });
    } catch (error) {
        console.error('[Analytics] Collaboration stats error:', error);
        res.status(500).json({ error: 'Failed to fetch collaboration stats' });
    }
});

// ============================================================================
// GET /analytics/llm-usage — LLM call logs & cost tracking
// ============================================================================

router.get('/llm-usage', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const days = parseInt(req.query.days as string) || 30;

        const [summary, daily, operations] = await Promise.all([
            query(
                `SELECT 
                    COUNT(*) as total_calls,
                    SUM(input_tokens) as total_input_tokens,
                    SUM(output_tokens) as total_output_tokens,
                    SUM(cost)::numeric(10,4) as total_cost,
                    AVG(duration_ms)::integer as avg_latency,
                    COUNT(*) FILTER (WHERE success = FALSE) as failed_calls
                 FROM llm_call_logs
                 WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${days} days'`,
                [userId]
            ),
            query(
                `SELECT date_trunc('day', created_at)::date as day,
                        COUNT(*) as calls,
                        SUM(cost)::numeric(10,4) as cost
                 FROM llm_call_logs
                 WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${days} days'
                 GROUP BY day
                 ORDER BY day`,
                [userId]
            ),
            query(
                `SELECT operation,
                        COUNT(*) as calls,
                        AVG(duration_ms)::integer as avg_latency,
                        SUM(cost)::numeric(10,4) as total_cost
                 FROM llm_call_logs
                 WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${days} days'
                 GROUP BY operation
                 ORDER BY calls DESC`,
                [userId]
            ),
        ]);

        res.json({
            summary: summary.rows[0],
            daily: daily.rows,
            byOperation: operations.rows,
        });
    } catch (error) {
        console.error('[Analytics] LLM usage error:', error);
        res.status(500).json({ error: 'Failed to fetch LLM usage' });
    }
});

export default router;
