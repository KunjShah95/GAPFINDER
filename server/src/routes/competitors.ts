import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

router.get('/groups', requireAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT DISTINCT venue as name, 'Research Lab' as type,
                    COUNT(*)::int as papers,
                    0 as h_index,
                    true as active
             FROM papers
             WHERE venue IS NOT NULL AND venue != ''
             GROUP BY venue
             ORDER BY COUNT(*) DESC
             LIMIT 20`
        );
        res.json({ groups: result.rows });
    } catch (error) {
        console.error('[Competitors] Groups error:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

router.get('/players', requireAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT DISTINCT unnest(authors) as name,
                    COUNT(*)::int as papers,
                    'Researcher' as type,
                    true as active
             FROM papers
             WHERE authors IS NOT NULL AND array_length(authors, 1) > 0
             GROUP BY unnest(authors)
             ORDER BY COUNT(*) DESC
             LIMIT 20`
        );
        res.json({ players: result.rows });
    } catch (error) {
        console.error('[Competitors] Players error:', error);
        res.status(500).json({ error: 'Failed to fetch players' });
    }
});

export default router;
