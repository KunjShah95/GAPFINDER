import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

router.get('/trends', requireAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT venue as topic, COUNT(*)::int as count,
                    COUNT(*)::float / (SELECT COUNT(*) FROM papers) * 100 as growth
             FROM papers
             WHERE venue IS NOT NULL AND venue != ''
             GROUP BY venue
             ORDER BY COUNT(*) DESC
             LIMIT 10`
        );
        res.json({ trends: result.rows });
    } catch (error) {
        console.error('[Impact] Trends error:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

router.get('/signals', requireAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT type as signal, COUNT(*)::int as count,
                    AVG(confidence)::float as confidence
             FROM gaps
             GROUP BY type
             ORDER BY COUNT(*) DESC`
        );
        res.json({ signals: result.rows });
    } catch (error) {
        console.error('[Impact] Signals error:', error);
        res.status(500).json({ error: 'Failed to fetch signals' });
    }
});

export default router;
