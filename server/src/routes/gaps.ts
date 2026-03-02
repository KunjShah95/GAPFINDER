// ============================================================================
// Gaps Routes
// CRUD operations for research gaps with voting and resolution tracking
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateGapSchema = z.object({
    paperId: z.string().uuid(),
    problem: z.string().min(10).max(5000),
    type: z.enum(['data', 'compute', 'evaluation', 'theory', 'deployment', 'methodology']),
    confidence: z.number().min(0).max(1).default(0.5),
    impactScore: z.enum(['low', 'medium', 'high']).default('medium'),
    difficulty: z.enum(['low', 'medium', 'high']).default('medium'),
    assumptions: z.array(z.string()).optional(),
    failures: z.array(z.string()).optional(),
    datasetGaps: z.array(z.string()).optional(),
    evaluationCritique: z.string().optional(),
});

const CreateBatchGapsSchema = z.object({
    paperId: z.string().uuid(),
    gaps: z.array(CreateGapSchema.omit({ paperId: true })),
});

// ============================================================================
// GET /gaps — List user's gaps with filtering
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;
        const type = req.query.type as string;
        const impact = req.query.impact as string;
        const resolved = req.query.resolved === 'true';
        const paperId = req.query.paperId as string;
        const searchQuery = req.query.q as string;

        const conditions: string[] = ['g.user_id = $1'];
        const params: any[] = [req.user!.userId];
        let paramIndex = 2;

        if (type) {
            conditions.push(`g.type = $${paramIndex++}`);
            params.push(type);
        }
        if (impact) {
            conditions.push(`g.impact_score = $${paramIndex++}`);
            params.push(impact);
        }
        if (resolved !== undefined && req.query.resolved) {
            conditions.push(`g.is_resolved = $${paramIndex++}`);
            params.push(resolved);
        }
        if (paperId) {
            conditions.push(`g.paper_id = $${paramIndex++}`);
            params.push(paperId);
        }
        if (searchQuery) {
            conditions.push(`g.search_vector @@ plainto_tsquery('english', $${paramIndex++})`);
            params.push(searchQuery);
        }

        const whereClause = conditions.join(' AND ');

        const countResult = await query(
            `SELECT COUNT(*) as total FROM gaps g WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);

        const result = await query(
            `SELECT g.*, p.title as paper_title, p.url as paper_url
             FROM gaps g
             LEFT JOIN papers p ON p.id = g.paper_id
             WHERE ${whereClause}
             ORDER BY g.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        res.json({
            gaps: result.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('[Gaps] List error:', error);
        res.status(500).json({ error: 'Failed to fetch gaps' });
    }
});

// ============================================================================
// POST /gaps — Create single gap
// ============================================================================

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateGapSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { paperId, problem, type, confidence, impactScore, difficulty,
            assumptions, failures, datasetGaps, evaluationCritique } = parsed.data;

        // Verify paper belongs to user
        const paperCheck = await query(
            'SELECT id FROM papers WHERE id = $1 AND user_id = $2',
            [paperId, req.user!.userId]
        );
        if (paperCheck.rows.length === 0) {
            res.status(404).json({ error: 'Paper not found' });
            return;
        }

        const result = await transaction(async (client) => {
            const gapResult = await client.query(
                `INSERT INTO gaps (paper_id, user_id, problem, type, confidence, impact_score, difficulty,
                                   assumptions, failures, dataset_gaps, evaluation_critique)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING *`,
                [paperId, req.user!.userId, problem, type, confidence, impactScore, difficulty,
                    assumptions || [], failures || [], datasetGaps || [], evaluationCritique || null]
            );

            // Update usage and XP
            await client.query(
                `UPDATE usage_records SET gaps_extracted = gaps_extracted + 1, last_updated = NOW()
                 WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
                [req.user!.userId]
            );

            await client.query(
                `UPDATE user_xp SET gaps_found = gaps_found + 1, total_xp = total_xp + 10, updated_at = NOW()
                 WHERE user_id = $1`,
                [req.user!.userId]
            );

            return gapResult.rows[0];
        });

        res.status(201).json(result);
    } catch (error) {
        console.error('[Gaps] Create error:', error);
        res.status(500).json({ error: 'Failed to create gap' });
    }
});

// ============================================================================
// POST /gaps/batch — Create multiple gaps from analysis
// ============================================================================

router.post('/batch', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateBatchGapsSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { paperId, gaps } = parsed.data;

        // Verify paper belongs to user
        const paperCheck = await query(
            'SELECT id FROM papers WHERE id = $1 AND user_id = $2',
            [paperId, req.user!.userId]
        );
        if (paperCheck.rows.length === 0) {
            res.status(404).json({ error: 'Paper not found' });
            return;
        }

        const results = await transaction(async (client) => {
            const createdGaps = [];

            for (const gap of gaps) {
                const result = await client.query(
                    `INSERT INTO gaps (paper_id, user_id, problem, type, confidence, impact_score, difficulty,
                                       assumptions, failures, dataset_gaps, evaluation_critique)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                     RETURNING *`,
                    [paperId, req.user!.userId, gap.problem, gap.type, gap.confidence,
                        gap.impactScore, gap.difficulty,
                        gap.assumptions || [], gap.failures || [], gap.datasetGaps || [],
                        gap.evaluationCritique || null]
                );
                createdGaps.push(result.rows[0]);
            }

            // Update usage and XP
            await client.query(
                `UPDATE usage_records SET gaps_extracted = gaps_extracted + $1, last_updated = NOW()
                 WHERE user_id = $2 AND period_start <= NOW() AND period_end >= NOW()`,
                [gaps.length, req.user!.userId]
            );

            await client.query(
                `UPDATE user_xp SET gaps_found = gaps_found + $1, total_xp = total_xp + ($1 * 10), updated_at = NOW()
                 WHERE user_id = $2`,
                [gaps.length, req.user!.userId]
            );

            return createdGaps;
        });

        res.status(201).json({ gaps: results, count: results.length });
    } catch (error) {
        console.error('[Gaps] Batch create error:', error);
        res.status(500).json({ error: 'Failed to create gaps' });
    }
});

// ============================================================================
// POST /gaps/:id/vote — Upvote or downvote a gap
// ============================================================================

router.post('/:id/vote', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const voteType = req.body.vote === -1 ? -1 : 1;

        await transaction(async (client) => {
            // Upsert vote
            await client.query(
                `INSERT INTO gap_votes (user_id, gap_id, vote_type)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, gap_id) DO UPDATE SET vote_type = $3, created_at = NOW()`,
                [req.user!.userId, req.params.id, voteType]
            );

            // Recalculate upvotes
            await client.query(
                `UPDATE gaps SET upvotes = (
                    SELECT COALESCE(SUM(vote_type), 0) FROM gap_votes WHERE gap_id = $1
                 ) WHERE id = $1`,
                [req.params.id]
            );
        });

        const result = await query('SELECT upvotes FROM gaps WHERE id = $1', [req.params.id]);
        res.json({ upvotes: result.rows[0]?.upvotes || 0 });
    } catch (error) {
        console.error('[Gaps] Vote error:', error);
        res.status(500).json({ error: 'Failed to vote' });
    }
});

// ============================================================================
// PATCH /gaps/:id/resolve — Mark gap as resolved
// ============================================================================

router.patch('/:id/resolve', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { resolvedBy } = req.body;

        const result = await query(
            `UPDATE gaps SET is_resolved = TRUE, resolved_by = $1, resolved_at = NOW()
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
            [resolvedBy || null, req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Gap not found' });
            return;
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Gaps] Resolve error:', error);
        res.status(500).json({ error: 'Failed to resolve gap' });
    }
});

// ============================================================================
// DELETE /gaps/:id — Delete gap
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            'DELETE FROM gaps WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Gap not found' });
            return;
        }

        res.json({ message: 'Gap deleted' });
    } catch (error) {
        console.error('[Gaps] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete gap' });
    }
});

// ============================================================================
// GET /gaps/stats — Get gap statistics for dashboard
// ============================================================================

router.get('/stats/overview', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT 
                COUNT(*) as total_gaps,
                COUNT(*) FILTER (WHERE is_resolved = TRUE) as resolved_gaps,
                COUNT(*) FILTER (WHERE impact_score = 'high') as high_impact,
                COUNT(*) FILTER (WHERE impact_score = 'medium') as medium_impact,
                COUNT(*) FILTER (WHERE impact_score = 'low') as low_impact,
                COUNT(*) FILTER (WHERE type = 'data') as data_gaps,
                COUNT(*) FILTER (WHERE type = 'compute') as compute_gaps,
                COUNT(*) FILTER (WHERE type = 'evaluation') as evaluation_gaps,
                COUNT(*) FILTER (WHERE type = 'theory') as theory_gaps,
                COUNT(*) FILTER (WHERE type = 'deployment') as deployment_gaps,
                COUNT(*) FILTER (WHERE type = 'methodology') as methodology_gaps,
                AVG(confidence) as avg_confidence,
                SUM(upvotes) as total_upvotes
             FROM gaps
             WHERE user_id = $1`,
            [req.user!.userId]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Gaps] Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
