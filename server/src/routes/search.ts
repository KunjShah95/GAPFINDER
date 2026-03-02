// ============================================================================
// Search Routes
// Advanced cross-entity search with filtering and ranking
// ============================================================================

import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

// ============================================================================
// GET /search — Universal search across papers, gaps, collections, users
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const q = req.query.q as string;
        const entityTypes = ((req.query.types as string) || 'papers,gaps,collections').split(',');
        const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

        if (!q || q.trim().length < 2) {
            res.status(400).json({ error: 'Search query must be at least 2 characters' });
            return;
        }

        const results: Record<string, any[]> = {};

        // Search Papers
        if (entityTypes.includes('papers')) {
            const papersResult = await query(
                `SELECT p.id, p.title, p.abstract, p.venue, p.year, p.url, p.created_at,
                        ts_rank(p.search_vector, plainto_tsquery('english', $2)) as relevance,
                        COUNT(g.id) as gap_count
                 FROM papers p
                 LEFT JOIN gaps g ON g.paper_id = p.id
                 WHERE p.user_id = $1 
                   AND p.search_vector @@ plainto_tsquery('english', $2)
                 GROUP BY p.id
                 ORDER BY relevance DESC
                 LIMIT $3`,
                [userId, q, limit]
            );
            results.papers = papersResult.rows;
        }

        // Search Gaps
        if (entityTypes.includes('gaps')) {
            const gapsResult = await query(
                `SELECT g.id, g.problem, g.type, g.impact_score, g.confidence, g.difficulty,
                        g.upvotes, g.is_resolved, g.created_at,
                        p.title as paper_title, p.url as paper_url,
                        ts_rank(g.search_vector, plainto_tsquery('english', $2)) as relevance
                 FROM gaps g
                 LEFT JOIN papers p ON p.id = g.paper_id
                 WHERE g.user_id = $1 
                   AND g.search_vector @@ plainto_tsquery('english', $2)
                 ORDER BY relevance DESC
                 LIMIT $3`,
                [userId, q, limit]
            );
            results.gaps = gapsResult.rows;
        }

        // Search Collections
        if (entityTypes.includes('collections')) {
            const collectionsResult = await query(
                `SELECT c.id, c.name, c.description, c.color, c.starred, c.created_at,
                        COUNT(DISTINCT cp.paper_id) as paper_count,
                        COUNT(DISTINCT cg.gap_id) as gap_count
                 FROM collections c
                 LEFT JOIN collection_papers cp ON cp.collection_id = c.id
                 LEFT JOIN collection_gaps cg ON cg.collection_id = c.id
                 WHERE c.user_id = $1 
                   AND (c.name ILIKE $2 OR c.description ILIKE $2)
                 GROUP BY c.id
                 ORDER BY c.starred DESC, c.created_at DESC
                 LIMIT $3`,
                [userId, `%${q}%`, limit]
            );
            results.collections = collectionsResult.rows;
        }

        // Search Community Gaps (public)
        if (entityTypes.includes('community')) {
            const communityResult = await query(
                `SELECT pg.id, g.problem, g.type, g.impact_score, pg.upvotes,
                        p.title as paper_title, u.name as author_name,
                        ts_rank(g.search_vector, plainto_tsquery('english', $1)) as relevance
                 FROM public_gaps pg
                 JOIN gaps g ON g.id = pg.gap_id
                 JOIN papers p ON p.id = g.paper_id
                 JOIN users u ON u.id = pg.user_id
                 WHERE g.search_vector @@ plainto_tsquery('english', $1)
                 ORDER BY relevance DESC, pg.upvotes DESC
                 LIMIT $2`,
                [q, limit]
            );
            results.community = communityResult.rows;
        }

        // Count total results
        const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

        res.json({ query: q, totalResults, results });
    } catch (error) {
        console.error('[Search] Error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// ============================================================================
// GET /search/suggestions — Auto-complete suggestions as user types
// ============================================================================

router.get('/suggestions', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const q = req.query.q as string;

        if (!q || q.trim().length < 2) {
            res.json({ suggestions: [] });
            return;
        }

        const [paperSuggestions, gapSuggestions] = await Promise.all([
            query(
                `SELECT DISTINCT title as text, 'paper' as type, id
                 FROM papers
                 WHERE user_id = $1 AND title ILIKE $2
                 LIMIT 5`,
                [userId, `%${q}%`]
            ),
            query(
                `SELECT DISTINCT LEFT(problem, 80) as text, 'gap' as type, id
                 FROM gaps
                 WHERE user_id = $1 AND problem ILIKE $2
                 LIMIT 5`,
                [userId, `%${q}%`]
            ),
        ]);

        const suggestions = [
            ...paperSuggestions.rows,
            ...gapSuggestions.rows,
        ].slice(0, 8);

        res.json({ suggestions });
    } catch (error) {
        console.error('[Search] Suggestions error:', error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});

// ============================================================================
// GET /search/similar-gaps — Find similar gaps using text similarity
// ============================================================================

router.get('/similar-gaps', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const gapId = req.query.gapId as string;

        if (!gapId) {
            res.status(400).json({ error: 'gapId is required' });
            return;
        }

        // Get the source gap's search vector
        const sourceGap = await query(
            `SELECT problem, search_vector FROM gaps WHERE id = $1 AND user_id = $2`,
            [gapId, userId]
        );

        if (sourceGap.rows.length === 0) {
            res.status(404).json({ error: 'Gap not found' });
            return;
        }

        // Find similar gaps using full-text search ranking
        const result = await query(
            `SELECT g.id, g.problem, g.type, g.impact_score, g.confidence,
                    p.title as paper_title, p.url as paper_url,
                    ts_rank(g.search_vector, to_tsquery('english', 
                        regexp_replace(plainto_tsquery('english', $1)::text, '''', '', 'g')
                    )) as similarity
             FROM gaps g
             LEFT JOIN papers p ON p.id = g.paper_id
             WHERE g.id != $2 
               AND g.user_id = $3
               AND g.search_vector @@ plainto_tsquery('english', $1)
             ORDER BY similarity DESC
             LIMIT 10`,
            [sourceGap.rows[0].problem.slice(0, 200), gapId, userId]
        );

        res.json({ similarGaps: result.rows, sourceGapId: gapId });
    } catch (error) {
        console.error('[Search] Similar gaps error:', error);
        res.status(500).json({ error: 'Failed to find similar gaps' });
    }
});

// ============================================================================
// GET /search/trending — Trending topics in the community
// ============================================================================

router.get('/trending', optionalAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
        // Find trending topics based on recently shared and upvoted gaps
        const result = await query(
            `SELECT g.type, 
                    LEFT(g.problem, 100) as topic,
                    pg.upvotes,
                    pg.view_count,
                    u.name as author_name,
                    p.venue,
                    pg.created_at
             FROM public_gaps pg
             JOIN gaps g ON g.id = pg.gap_id
             JOIN papers p ON p.id = g.paper_id
             JOIN users u ON u.id = pg.user_id
             WHERE pg.created_at > NOW() - INTERVAL '7 days'
             ORDER BY pg.upvotes DESC, pg.view_count DESC
             LIMIT 20`
        );

        // Extract unique type counts for trending categories
        const categoryResult = await query(
            `SELECT g.type, COUNT(*) as count
             FROM public_gaps pg
             JOIN gaps g ON g.id = pg.gap_id
             WHERE pg.created_at > NOW() - INTERVAL '30 days'
             GROUP BY g.type
             ORDER BY count DESC`
        );

        res.json({
            trending: result.rows,
            trendingCategories: categoryResult.rows,
        });
    } catch (error) {
        console.error('[Search] Trending error:', error);
        res.status(500).json({ error: 'Failed to fetch trending topics' });
    }
});

export default router;
