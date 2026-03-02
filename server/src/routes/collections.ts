// ============================================================================
// Collections Routes
// Organize papers and gaps into collections
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const CreateCollectionSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// ============================================================================
// GET /collections — List user's collections
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT c.*,
                    COUNT(DISTINCT cp.paper_id) as paper_count,
                    COUNT(DISTINCT cg.gap_id) as gap_count
             FROM collections c
             LEFT JOIN collection_papers cp ON cp.collection_id = c.id
             LEFT JOIN collection_gaps cg ON cg.collection_id = c.id
             WHERE c.user_id = $1
             GROUP BY c.id
             ORDER BY c.starred DESC, c.created_at DESC`,
            [req.user!.userId]
        );

        res.json({ collections: result.rows });
    } catch (error) {
        console.error('[Collections] List error:', error);
        res.status(500).json({ error: 'Failed to fetch collections' });
    }
});

// ============================================================================
// POST /collections — Create collection
// ============================================================================

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateCollectionSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { name, description, color } = parsed.data;

        const result = await query(
            `INSERT INTO collections (user_id, name, description, color)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.user!.userId, name, description || null, color || '#6366f1']
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[Collections] Create error:', error);
        res.status(500).json({ error: 'Failed to create collection' });
    }
});

// ============================================================================
// POST /collections/:id/papers — Add paper to collection
// ============================================================================

router.post('/:id/papers', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { paperId } = req.body;
        if (!paperId) {
            res.status(400).json({ error: 'paperId is required' });
            return;
        }

        await query(
            `INSERT INTO collection_papers (collection_id, paper_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [req.params.id, paperId]
        );

        res.json({ message: 'Paper added to collection' });
    } catch (error) {
        console.error('[Collections] Add paper error:', error);
        res.status(500).json({ error: 'Failed to add paper' });
    }
});

// ============================================================================
// POST /collections/:id/gaps — Add gap to collection
// ============================================================================

router.post('/:id/gaps', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { gapId } = req.body;
        if (!gapId) {
            res.status(400).json({ error: 'gapId is required' });
            return;
        }

        await query(
            `INSERT INTO collection_gaps (collection_id, gap_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [req.params.id, gapId]
        );

        res.json({ message: 'Gap added to collection' });
    } catch (error) {
        console.error('[Collections] Add gap error:', error);
        res.status(500).json({ error: 'Failed to add gap' });
    }
});

// ============================================================================
// PATCH /collections/:id/star — Toggle star
// ============================================================================

router.patch('/:id/star', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `UPDATE collections SET starred = NOT starred WHERE id = $1 AND user_id = $2 RETURNING starred`,
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Collection not found' });
            return;
        }

        res.json({ starred: result.rows[0].starred });
    } catch (error) {
        console.error('[Collections] Star error:', error);
        res.status(500).json({ error: 'Failed to toggle star' });
    }
});

// ============================================================================
// DELETE /collections/:id — Delete collection
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            'DELETE FROM collections WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Collection not found' });
            return;
        }

        res.json({ message: 'Collection deleted' });
    } catch (error) {
        console.error('[Collections] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete collection' });
    }
});

export default router;
