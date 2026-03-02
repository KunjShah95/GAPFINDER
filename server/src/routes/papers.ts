// ============================================================================
// Papers Routes
// CRUD operations for papers with full-text search
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth, checkQuota } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreatePaperSchema = z.object({
    url: z.string().url(),
    title: z.string().min(1).max(500),
    abstract: z.string().optional(),
    authors: z.array(z.string()).optional(),
    venue: z.string().optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    content: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

const SearchSchema = z.object({
    q: z.string().min(1).max(500).optional(),
    venue: z.string().optional(),
    year: z.number().int().optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    sort: z.enum(['created_at', 'title', 'year', 'citation_count']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// GET /papers — List user's papers with search
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = SearchSchema.safeParse({
            ...req.query,
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
            year: req.query.year ? parseInt(req.query.year as string) : undefined,
        });

        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { q, venue, year, page, limit, sort, order } = parsed.data;
        const offset = (page - 1) * limit;
        const conditions: string[] = ['p.user_id = $1'];
        const params: any[] = [req.user!.userId];
        let paramIndex = 2;

        if (q) {
            conditions.push(`p.search_vector @@ plainto_tsquery('english', $${paramIndex})`);
            params.push(q);
            paramIndex++;
        }

        if (venue) {
            conditions.push(`p.venue ILIKE $${paramIndex}`);
            params.push(`%${venue}%`);
            paramIndex++;
        }

        if (year) {
            conditions.push(`p.year = $${paramIndex}`);
            params.push(year);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) as total FROM papers p WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);

        // Get papers with gap count
        const result = await query(
            `SELECT p.id, p.url, p.title, p.abstract, p.authors, p.venue, p.year,
                    p.citation_count, p.metadata, p.created_at, p.updated_at,
                    COUNT(g.id) as gap_count
             FROM papers p
             LEFT JOIN gaps g ON g.paper_id = p.id
             WHERE ${whereClause}
             GROUP BY p.id
             ORDER BY p.${sort} ${order}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        res.json({
            papers: result.rows.map(r => ({
                ...r,
                gap_count: parseInt(r.gap_count),
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('[Papers] List error:', error);
        res.status(500).json({ error: 'Failed to fetch papers' });
    }
});

// ============================================================================
// GET /papers/:id — Get single paper with gaps
// ============================================================================

router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT p.*, 
                    json_agg(
                        json_build_object(
                            'id', g.id,
                            'problem', g.problem,
                            'type', g.type,
                            'confidence', g.confidence,
                            'impact_score', g.impact_score,
                            'difficulty', g.difficulty,
                            'assumptions', g.assumptions,
                            'failures', g.failures,
                            'dataset_gaps', g.dataset_gaps,
                            'evaluation_critique', g.evaluation_critique,
                            'upvotes', g.upvotes,
                            'is_resolved', g.is_resolved,
                            'created_at', g.created_at
                        )
                    ) FILTER (WHERE g.id IS NOT NULL) as gaps
             FROM papers p
             LEFT JOIN gaps g ON g.paper_id = p.id
             WHERE p.id = $1 AND p.user_id = $2
             GROUP BY p.id`,
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Paper not found' });
            return;
        }

        const paper = result.rows[0];
        paper.gaps = paper.gaps || [];

        res.json(paper);
    } catch (error) {
        console.error('[Papers] Get error:', error);
        res.status(500).json({ error: 'Failed to fetch paper' });
    }
});

// ============================================================================
// POST /papers — Create paper
// ============================================================================

router.post('/', requireAuth, checkQuota('papers'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreatePaperSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { url, title, abstract, authors, venue, year, content, metadata } = parsed.data;

        const result = await transaction(async (client) => {
            // Create paper
            const paperResult = await client.query(
                `INSERT INTO papers (user_id, url, title, abstract, authors, venue, year, content, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [req.user!.userId, url, title, abstract || null, authors || [], venue || null, year || null, content || null, metadata || {}]
            );

            // Update usage
            await client.query(
                `UPDATE usage_records SET papers_processed = papers_processed + 1, last_updated = NOW()
                 WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()`,
                [req.user!.userId]
            );

            // Update XP stats
            await client.query(
                `UPDATE user_xp SET papers_analyzed = papers_analyzed + 1, total_xp = total_xp + 25, updated_at = NOW()
                 WHERE user_id = $1`,
                [req.user!.userId]
            );

            return paperResult.rows[0];
        });

        res.status(201).json(result);
    } catch (error) {
        console.error('[Papers] Create error:', error);
        res.status(500).json({ error: 'Failed to create paper' });
    }
});

// ============================================================================
// DELETE /papers/:id — Delete paper and its gaps
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            'DELETE FROM papers WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Paper not found' });
            return;
        }

        res.json({ message: 'Paper deleted' });
    } catch (error) {
        console.error('[Papers] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete paper' });
    }
});

export default router;
