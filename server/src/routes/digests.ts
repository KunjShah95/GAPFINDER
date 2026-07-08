// ============================================================================
// Literature Digests API
// Auto-generated daily/weekly AI summaries of new papers
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

const CreateDigestSchema = z.object({
    name: z.string().min(1).max(100),
    frequency: z.enum(['daily', 'weekly']),
    domains: z.array(z.string()).min(1),
    sources: z.array(z.string()).optional().default(['arxiv']),
    minCitations: z.number().optional().default(0),
    includeAbstracts: z.boolean().optional().default(true),
});

// ============================================================================
// GET /api/digests — List user's digest configurations
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(`
            SELECT * FROM digest_configs 
            WHERE user_id = $1 AND is_active = TRUE
            ORDER BY created_at DESC
        `, [userId]);

        res.json({ configs: result.rows });
    } catch (error) {
        console.error('[Digests] List error:', error);
        res.status(500).json({ error: 'Failed to fetch digests' });
    }
});

// ============================================================================
// POST /api/digests — Create new digest configuration
// ============================================================================

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateDigestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const userId = req.user!.userId;
        const { name, frequency, domains, sources, minCitations, includeAbstracts } = parsed.data;

        const nextGen = calculateNextGeneration(frequency);

        const result = await query(`
            INSERT INTO digest_configs (
                user_id, name, frequency, domains, sources, 
                min_citations, include_abstracts, is_active, next_generation_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
            RETURNING *
        `, [userId, name, frequency, JSON.stringify(domains), JSON.stringify(sources), minCitations, includeAbstracts, nextGen]);

        res.status(201).json({ config: result.rows[0] });
    } catch (error) {
        console.error('[Digests] Create error:', error);
        res.status(500).json({ error: 'Failed to create digest' });
    }
});

// ============================================================================
// PATCH /api/digests/:id — Update digest configuration
// ============================================================================

router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;
        const updates = req.body;

        const setClauses: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.name) {
            setClauses.push(`name = $${idx++}`);
            values.push(updates.name);
        }
        if (updates.frequency) {
            setClauses.push(`frequency = $${idx++}`);
            values.push(updates.frequency);
        }
        if (updates.domains) {
            setClauses.push(`domains = $${idx++}`);
            values.push(JSON.stringify(updates.domains));
        }
        if (typeof updates.isActive === 'boolean') {
            setClauses.push(`is_active = $${idx++}`);
            values.push(updates.isActive);
        }

        if (setClauses.length === 0) {
            res.status(400).json({ error: 'No updates provided' });
            return;
        }

        values.push(id, userId);

        const result = await query(`
            UPDATE digest_configs
            SET ${setClauses.join(', ')}
            WHERE id = $${idx++} AND user_id = $${idx}
            RETURNING *
        `, values);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Digest not found' });
            return;
        }

        res.json({ config: result.rows[0] });
    } catch (error) {
        console.error('[Digests] Update error:', error);
        res.status(500).json({ error: 'Failed to update digest' });
    }
});

// ============================================================================
// DELETE /api/digests/:id — Delete digest configuration
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;

        await query(`
            UPDATE digest_configs
            SET is_active = FALSE
            WHERE id = $1 AND user_id = $2
        `, [id, userId]);

        res.json({ message: 'Digest deleted' });
    } catch (error) {
        console.error('[Digests] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete digest' });
    }
});

// ============================================================================
// GET /api/digests/:id/contents — Get digest content history
// ============================================================================

router.get('/:id/contents', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

        // Verify ownership
        const configCheck = await query(`
            SELECT id FROM digest_configs 
            WHERE id = $1 AND user_id = $2 AND is_active = TRUE
        `, [id, userId]);

        if (configCheck.rows.length === 0) {
            res.status(404).json({ error: 'Digest not found' });
            return;
        }

        const result = await query(`
            SELECT * FROM digest_contents
            WHERE config_id = $1
            ORDER BY generated_at DESC
            LIMIT $2
        `, [id, limit]);

        res.json({ contents: result.rows });
    } catch (error) {
        console.error('[Digests] Contents error:', error);
        res.status(500).json({ error: 'Failed to fetch digest contents' });
    }
});

// ============================================================================
// Helper Functions
// ============================================================================

function calculateNextGeneration(frequency: string): Date {
    const now = new Date();
    
    if (frequency === 'daily') {
        now.setDate(now.getDate() + 1);
        now.setHours(6, 0, 0, 0);
    } else {
        const dayOfWeek = now.getDay();
        const daysUntilMonday = (8 - dayOfWeek) % 7 || 7;
        now.setDate(now.getDate() + daysUntilMonday);
        now.setHours(6, 0, 0, 0);
    }
    
    return now;
}

export default router;
