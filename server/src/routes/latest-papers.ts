// ============================================================================
// Latest Papers Routes
// GET  /api/latest-papers          — paginated list, filterable by publisher
// GET  /api/latest-papers/publishers — supported publisher list + last-run info
// POST /api/latest-papers/refresh  — admin-only manual trigger
// ============================================================================

import { Router, Request, Response } from 'express';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { runLatestPapersFetch } from '../services/latest-papers-cron.js';

const router = Router();

// Supported publishers the cron fetches from (in priority order)
const SUPPORTED_PUBLISHERS = [
    { id: 'arxiv',     name: 'arXiv',       description: 'Open-access preprints — CS, Physics, Math, Biology' },
    { id: 'pubmed',    name: 'PubMed',      description: 'NCBI — Life & biomedical sciences' },
    { id: 'crossref',  name: 'CrossRef',    description: 'Multi-publisher DOI registry — peer-reviewed journals' },
    { id: 'biorxiv',   name: 'bioRxiv',     description: 'Cold Spring Harbor preprints — Biology' },
    { id: 'plos',      name: 'PLOS ONE',    description: 'Multidisciplinary open-access mega-journal' },
    { id: 'nature',    name: 'Nature',      description: 'Nature Publishing Group flagship journal' },
    { id: 'ieee',      name: 'IEEE',        description: 'IEEE Transactions — Engineering & Computer Science' },
    { id: 'springer',  name: 'Springer',    description: 'Springer Nature open-access articles' },
];

// Publishers accessible per subscription tier.
// Ordered by SUPPORTED_PUBLISHERS so "first N" = most accessible first.
const TIER_PUBLISHER_LIMITS: Record<string, number> = {
    free:       2,   // arXiv + PubMed
    pro:        5,   // + CrossRef, bioRxiv, PLOS
    team:       8,   // all 8
    enterprise: 8,   // all 8
};

function getAllowedPublishersForTier(tier: string): string[] {
    const limit = TIER_PUBLISHER_LIMITS[tier] ?? 2;
    return SUPPORTED_PUBLISHERS.slice(0, limit).map(p => p.id);
}

// ============================================================================
// GET /api/latest-papers/publishers
// ============================================================================

router.get('/publishers', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        // Last run info per publisher (from cron log)
        const logResult = await query(
            `SELECT status, finished_at, papers_fetched 
             FROM cron_run_log 
             WHERE job_name = 'latest_papers_fetch'
             ORDER BY started_at DESC 
             LIMIT 1`
        );

        const lastRun = logResult.rows[0] ?? null;

        // Count per publisher
        const countsResult = await query(
            `SELECT publisher, COUNT(*) AS count 
             FROM latest_papers 
             GROUP BY publisher`
        );

        const counts: Record<string, number> = {};
        for (const row of countsResult.rows) {
            counts[row.publisher] = parseInt(row.count, 10);
        }

        // Filter publishers to only those accessible for the user's tier
        const tier = req.user!.tier;
        const allowedIds = getAllowedPublishersForTier(tier);
        const publishers = SUPPORTED_PUBLISHERS.map(p => ({
            ...p,
            paperCount: counts[p.id] ?? 0,
            accessible: allowedIds.includes(p.id),
        }));

        res.json({ publishers, lastRun, tier });
    } catch (error) {
        console.error('[LatestPapers] Publishers error:', error);
        res.status(500).json({ error: 'Failed to fetch publisher info' });
    }
});

// ============================================================================
// GET /api/latest-papers
// Query params:
//   publisher  — comma-separated list e.g. "arxiv,nature"   (default: all)
//   page       — 1-based page number                         (default: 1)
//   limit      — results per page, max 100                   (default: 20)
//   since      — ISO date string, only papers published after this date
//   q          — full-text search on title / abstract
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const tier = req.user!.tier;
        const tierAllowedPublishers = getAllowedPublishersForTier(tier);

        const publisherParam = typeof req.query.publisher === 'string' ? req.query.publisher : '';
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
        const offset = (page - 1) * limit;
        const since = typeof req.query.since === 'string' ? req.query.since : null;
        const searchQuery = typeof req.query.q === 'string' ? req.query.q.trim() : null;

        // Intersect user's requested publishers with what their tier allows
        const filterPublishers = publisherParam
            ? publisherParam.split(',').map(s => s.trim()).filter(s => tierAllowedPublishers.includes(s))
            : tierAllowedPublishers;

        // Return 403 if the requested publisher is not allowed for the user's tier
        if (publisherParam) {
            const requested = publisherParam.split(',').map(s => s.trim());
            const blocked = requested.filter(s => !tierAllowedPublishers.includes(s));
            if (blocked.length > 0) {
                res.status(403).json({
                    error: 'Publisher access restricted',
                    message: `Your ${tier} plan does not include publisher feeds: ${blocked.join(', ')}. Upgrade to access all publishers.`,
                    blockedPublishers: blocked,
                    allowedPublishers: tierAllowedPublishers,
                    upgradeRequired: true,
                });
                return;
            }
        }

        const params: unknown[] = [filterPublishers, limit, offset];
        let whereExtra = '';
        let paramIdx = 4;

        if (since) {
            const sinceDate = new Date(since);
            if (!isNaN(sinceDate.getTime())) {
                whereExtra += ` AND published_at >= $${paramIdx}`;
                params.push(sinceDate.toISOString());
                paramIdx++;
            }
        }

        if (searchQuery) {
            whereExtra += ` AND (title ILIKE $${paramIdx} OR abstract ILIKE $${paramIdx})`;
            params.push(`%${searchQuery}%`);
            paramIdx++;
        }

        const dataResult = await query(
            `SELECT id, external_id, publisher, title, abstract, url, authors, venue, year, published_at, fetched_at
             FROM latest_papers
             WHERE publisher = ANY($1::text[])${whereExtra}
             ORDER BY published_at DESC NULLS LAST
             LIMIT $2 OFFSET $3`,
            params,
        );

        // Total count (for pagination)
        const countResult = await query(
            `SELECT COUNT(*) AS total 
             FROM latest_papers
             WHERE publisher = ANY($1::text[])${whereExtra}`,
            [filterPublishers, ...params.slice(3)],
        );

        const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

        res.json({
            papers: dataResult.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('[LatestPapers] List error:', error);
        res.status(500).json({ error: 'Failed to fetch latest papers' });
    }
});

// ============================================================================
// POST /api/latest-papers/refresh
// Manually triggers a fresh fetch (auth required; rate-limited naturally by
// the fact that the function itself only saves *new* papers)
// ============================================================================

router.post('/refresh', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const tier = req.user!.tier;
    // Free users cannot trigger a manual refresh
    if (tier === 'free') {
        res.status(403).json({
            error: 'Manual refresh not available on the free plan',
            message: 'Upgrade to Pro or higher to trigger an on-demand feed refresh.',
            upgradeRequired: true,
        });
        return;
    }
    try {
        // Fire-and-forget — don't await so the HTTP response returns quickly
        runLatestPapersFetch().then(result => {
            console.log('[LatestPapers] Manual refresh complete:', result);
        });

        res.json({ message: 'Refresh started. New papers will appear shortly.' });
    } catch (error) {
        console.error('[LatestPapers] Refresh error:', error);
        res.status(500).json({ error: 'Failed to start refresh' });
    }
});

export default router;
