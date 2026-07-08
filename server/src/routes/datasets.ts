import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT id::text, title as name, 'Unknown' as domain, 'N/A' as size,
                    COALESCE(venue, 'Unknown') as format, 0 as citation_count,
                    created_at
             FROM papers
             ORDER BY created_at DESC
             LIMIT 50`
        );
        res.json({ datasets: result.rows });
    } catch (error) {
        console.error('[Datasets] List error:', error);
        res.status(500).json({ error: 'Failed to fetch datasets' });
    }
});

export default router;
