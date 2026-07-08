// ============================================================================
// Public API Routes
// External-facing REST API for programmatic access
// Uses API key authentication (from api_keys table) instead of JWT
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query, transaction } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { enqueuePublicAnalysisJob } from '../queues/public-analysis.queue.js';

const router = Router();

// ============================================================================
// TYPES
// ============================================================================

// Re-export from middleware
export type { ApiKeyUser } from '../middleware/api-auth.js';

// Use the apiKey from middleware
declare module '../middleware/api-auth.js' {
    interface ApiKeyUser {
        keyId?: string;
        permissions?: string[];
    }
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const AnalyzeRequestSchema = z.object({
    url: z.string()
        .url('Must be a valid URL')
        .max(2000, 'URL too long')
        .refine(
            (url) => {
                try {
                    const u = new URL(url);
                    return ['http:', 'https:'].includes(u.protocol);
                } catch { return false; }
            },
            'Only HTTP and HTTPS URLs are allowed'
        ),
    includeGaps: z.boolean().optional().default(true),
    language: z.string().max(10).optional().default('en'),
});

const SearchGapsSchema = PaginationSchema.extend({
    q: z.string().min(1).max(500).optional(),
    type: z.enum(['data', 'compute', 'evaluation', 'theory', 'deployment', 'methodology']).optional(),
    impact: z.enum(['low', 'medium', 'high']).optional(),
    sort: z.enum(['upvotes', 'recent', 'views']).default('upvotes'),
});

const VoteSchema = z.object({
    vote: z.union([z.literal(1), z.literal(-1)]),
});

const CreateApiKeySchema = z.object({
    name: z.string()
        .min(1, 'Name is required')
        .max(255, 'Name too long')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Name can only contain letters, numbers, spaces, hyphens, underscores'),
    permissions: z.array(
        z.enum(['read', 'write', 'analyze', 'export'])
    ).min(1, 'At least one permission required').default(['read']),
    expiresInDays: z.number().int().min(1).max(365).optional(),
});

const LeaderboardSchema = z.object({
    period: z.enum(['all_time', 'weekly', 'monthly']).default('all_time'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// API KEY AUTH MIDDLEWARE
// ============================================================================

async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    const apiKeyHeader = req.headers['x-api-key'] as string || '';
    const authHeader = req.headers.authorization || '';

    // Support both X-Api-Key and Authorization: Bearer gm_xxx
    const rawKey = apiKeyHeader
        || (authHeader.startsWith('Bearer gm_') ? authHeader.slice(7) : '');

    if (!rawKey || !rawKey.startsWith('gm_')) {
        res.status(401).json({
            error: {
                code: 'MISSING_API_KEY',
                message: 'API key is required. Pass via X-Api-Key header or Authorization: Bearer gm_xxx',
            },
        });
        return;
    }

    try {
        const keyPrefix = rawKey.slice(0, 10);
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

        const result = await query(
            `SELECT ak.id, ak.user_id, ak.permissions, ak.is_active, ak.expires_at,
                    COALESCE(s.tier, 'free') as tier
             FROM api_keys ak
             LEFT JOIN subscriptions s ON s.user_id = ak.user_id
             WHERE ak.key_prefix = $1 AND ak.key_hash = $2`,
            [keyPrefix, keyHash]
        );

        if (result.rows.length === 0) {
            res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
            return;
        }

        const keyRecord = result.rows[0];

        if (!keyRecord.is_active) {
            res.status(403).json({ error: { code: 'KEY_DISABLED', message: 'API key is disabled' } });
            return;
        }

        if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
            res.status(403).json({ error: { code: 'KEY_EXPIRED', message: 'API key has expired' } });
            return;
        }

        req.apiKey = {
            userId: keyRecord.user_id,
            apiKeyId: keyRecord.id,
            keyId: keyRecord.id,
            name: keyRecord.name,
            permissions: keyRecord.permissions || ['read'],
            tier: keyRecord.tier || 'free',
            rateLimit: 100,
            monthlyUsage: 0,
        };

        // Update last_used_at (fire and forget)
        query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyRecord.id]).catch(() => { });

        next();
    } catch (error) {
        console.error('[PublicAPI] Auth error:', error);
        res.status(500).json({ error: { code: 'AUTH_ERROR', message: 'Authentication failed' } });
    }
}

function requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.apiKey) {
            res.status(401).json({ error: { code: 'NOT_AUTHENTICATED', message: 'Authentication required' } });
            return;
        }
        const perms = req.apiKey.permissions || [];
        if (!perms.includes(permission)) {
            res.status(403).json({
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: `API key lacks "${permission}" permission`,
                    required: permission,
                    current: perms,
                },
            });
            return;
        }
        next();
    };
}

function validationError(res: Response, issues: z.ZodIssue[]) {
    res.status(400).json({
        error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: issues.map(i => ({
                field: i.path.join('.'),
                message: i.message,
                code: i.code,
            })),
        },
    });
}

// ============================================================================
// GET /api/public/gaps — List public community gaps
// ============================================================================

router.get('/gaps', requireApiKey, requirePermission('read'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = SearchGapsSchema.safeParse(req.query);
        if (!parsed.success) { validationError(res, parsed.error.issues); return; }

        const { q, type, impact, sort, page, limit } = parsed.data;
        const offset = (page - 1) * limit;

        let orderBy = 'pg.upvotes DESC, pg.created_at DESC';
        if (sort === 'recent') orderBy = 'pg.created_at DESC';
        if (sort === 'views') orderBy = 'pg.view_count DESC';

        const conditions: string[] = ['pg.id IS NOT NULL'];
        const params: any[] = [];
        let idx = 1;

        if (q) {
            conditions.push(`g.search_vector @@ plainto_tsquery('english', $${idx})`);
            params.push(q);
            idx++;
        }
        if (type) {
            conditions.push(`g.type = $${idx}`);
            params.push(type);
            idx++;
        }
        if (impact) {
            conditions.push(`g.impact_score = $${idx}`);
            params.push(impact);
            idx++;
        }

        const where = conditions.join(' AND ');

        const countResult = await query(
            `SELECT COUNT(*) as total FROM public_gaps pg
             JOIN gaps g ON g.id = pg.gap_id
             WHERE ${where}`, params
        );
        const total = parseInt(countResult.rows[0].total);

        const result = await query(
            `SELECT pg.id, pg.share_reason, pg.upvotes, pg.view_count, pg.created_at,
                    g.problem, g.type, g.confidence, g.impact_score, g.difficulty,
                    g.assumptions, g.failures, g.evaluation_critique,
                    p.title as paper_title, p.url as paper_url, p.venue, p.year,
                    u.name as author_name
             FROM public_gaps pg
             JOIN gaps g ON g.id = pg.gap_id
             JOIN papers p ON p.id = g.paper_id
             JOIN users u ON u.id = pg.user_id
             WHERE ${where}
             ORDER BY ${orderBy}
             LIMIT $${idx} OFFSET $${idx + 1}`,
            [...params, limit, offset]
        );

        // Increment views (fire and forget)
        if (result.rows.length > 0) {
            const ids = result.rows.map((r: any) => r.id);
            query('UPDATE public_gaps SET view_count = view_count + 1 WHERE id = ANY($1)', [ids]).catch(() => { });
        }

        res.json({
            data: result.rows,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('[PublicAPI] Gaps list error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch gaps' } });
    }
});

// ============================================================================
// GET /api/public/gaps/:id — Get single gap detail
// ============================================================================

router.get('/gaps/:id', requireApiKey, requirePermission('read'), async (req: Request, res: Response): Promise<void> => {
    try {
        const idParsed = z.string().uuid().safeParse(req.params.id);
        if (!idParsed.success) { validationError(res, idParsed.error.issues); return; }

        const result = await query(
            `SELECT pg.id, pg.share_reason, pg.upvotes, pg.view_count, pg.created_at,
                    g.problem, g.type, g.confidence, g.impact_score, g.difficulty,
                    g.assumptions, g.failures, g.evaluation_critique,
                    p.title as paper_title, p.url as paper_url, p.venue, p.year, p.abstract,
                    p.authors as paper_authors,
                    u.name as author_name
             FROM public_gaps pg
             JOIN gaps g ON g.id = pg.gap_id
             JOIN papers p ON p.id = g.paper_id
             JOIN users u ON u.id = pg.user_id
             WHERE pg.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gap not found' } });
            return;
        }

        // Increment view count
        query('UPDATE public_gaps SET view_count = view_count + 1 WHERE id = $1', [req.params.id]).catch(() => { });

        res.json({ data: result.rows[0] });
    } catch (error) {
        console.error('[PublicAPI] Gap detail error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch gap' } });
    }
});

// ============================================================================
// POST /api/public/gaps/:id/vote — Vote on a public gap
// ============================================================================

router.post('/gaps/:id/vote', requireApiKey, requirePermission('write'), async (req: Request, res: Response): Promise<void> => {
    try {
        const idParsed = z.string().uuid().safeParse(req.params.id);
        if (!idParsed.success) { validationError(res, idParsed.error.issues); return; }

        const parsed = VoteSchema.safeParse(req.body);
        if (!parsed.success) { validationError(res, parsed.error.issues); return; }

        const voteType = parsed.data.vote;
        const userId = req.apiKey!.userId;

        await transaction(async (client) => {
            await client.query(
                `INSERT INTO public_gap_votes (user_id, public_gap_id, vote_type)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, public_gap_id) DO UPDATE SET vote_type = $3, created_at = NOW()`,
                [userId, req.params.id, voteType]
            );
            await client.query(
                `UPDATE public_gaps SET upvotes = (
                    SELECT COALESCE(SUM(vote_type), 0) FROM public_gap_votes WHERE public_gap_id = $1
                 ) WHERE id = $1`,
                [req.params.id]
            );
        });

        const result = await query('SELECT upvotes FROM public_gaps WHERE id = $1', [req.params.id]);

        res.json({ data: { upvotes: result.rows[0]?.upvotes || 0 } });
    } catch (error) {
        console.error('[PublicAPI] Vote error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to vote' } });
    }
});

// ============================================================================
// GET /api/public/leaderboard — Community leaderboard
// ============================================================================

router.get('/leaderboard', requireApiKey, requirePermission('read'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = LeaderboardSchema.safeParse(req.query);
        if (!parsed.success) { validationError(res, parsed.error.issues); return; }

        const { period, limit } = parsed.data;
        const cacheKey = `leaderboard:v1:${period}:top${limit}`;
        const cached = await cacheGet<any[]>(cacheKey);
        if (cached) {
            res.json({ data: cached, meta: { period, cached: true } });
            return;
        }

        let dateFilter = '';
        if (period === 'weekly') dateFilter = "AND pg.created_at > NOW() - INTERVAL '7 days'";
        else if (period === 'monthly') dateFilter = "AND pg.created_at > NOW() - INTERVAL '30 days'";

        const result = await query(
            `SELECT u.id as user_id, u.name,
                    COUNT(pg.id) as shared_gaps,
                    COALESCE(SUM(pg.upvotes), 0) as total_upvotes,
                    COALESCE(SUM(pg.view_count), 0) as total_views
             FROM users u
             JOIN public_gaps pg ON pg.user_id = u.id ${dateFilter}
             GROUP BY u.id, u.name
             HAVING COUNT(pg.id) > 0
             ORDER BY total_upvotes DESC
             LIMIT $1`,
            [limit]
        );

        const leaderboard = result.rows.map((row: any, index: number) => ({
            rank: index + 1,
            ...row,
        }));

        await cacheSet(cacheKey, leaderboard, 60);

        res.json({ data: leaderboard, meta: { period, cached: false } });
    } catch (error) {
        console.error('[PublicAPI] Leaderboard error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch leaderboard' } });
    }
});

// ============================================================================
// POST /api/public/analyze — Submit URL for analysis (queued)
// ============================================================================

router.post('/analyze', requireApiKey, requirePermission('analyze'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = AnalyzeRequestSchema.safeParse(req.body);
        if (!parsed.success) { validationError(res, parsed.error.issues); return; }

        const { url, includeGaps, language } = parsed.data;

        const inserted = await query(
            `INSERT INTO batch_jobs (user_id, job_type, status, input_data, total_items, processed_items, progress)
             VALUES ($1, 'gap_extraction', 'queued', $2::jsonb, 1, 0, 0)
             RETURNING id, status, created_at`,
            [
                req.apiKey!.userId,
                JSON.stringify({ source: 'public_api', url, includeGaps, language }),
            ]
        );

        const batchJob = inserted.rows[0];

        try {
            await enqueuePublicAnalysisJob({
                batchJobId: batchJob.id,
                userId: req.apiKey!.userId,
                url,
                includeGaps,
                language,
            });
        } catch (queueError) {
            console.error('[PublicAPI] Queue error:', queueError);

            await query(
                `UPDATE batch_jobs
                 SET status = 'failed', completed_at = NOW(), error_message = $2
                 WHERE id = $1`,
                [batchJob.id, 'Queue unavailable: Redis must be reachable and BullMQ-compatible (Redis 5+).']
            ).catch(() => { });

            res.status(503).json({
                error: {
                    code: 'QUEUE_UNAVAILABLE',
                    message: 'Background queue is unavailable. Check Redis connectivity / version.',
                },
            });
            return;
        }

        res.status(202).json({
            data: {
                jobId: batchJob.id,
                status: batchJob.status,
                url,
                options: { includeGaps, language },
            },
            meta: {
                message: 'Analysis job queued. Use GET /api/public/jobs/:id to check status.',
            },
        });
    } catch (error) {
        console.error('[PublicAPI] Analyze error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to queue analysis' } });
    }
});

// ============================================================================
// GET /api/public/jobs/:id — Check analysis job status
// ============================================================================

router.get('/jobs/:id', requireApiKey, requirePermission('read'), async (req: Request, res: Response): Promise<void> => {
    try {
        const idParsed = z.string().uuid().safeParse(req.params.id);
        if (!idParsed.success) { validationError(res, idParsed.error.issues); return; }

        const result = await query(
            `SELECT id, status, progress, created_at, started_at, completed_at, output_data, error_message
             FROM batch_jobs
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.apiKey!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
            return;
        }

        const job = result.rows[0];
        res.json({
            data: {
                jobId: job.id,
                status: job.status,
                progress: job.progress,
                createdAt: job.created_at,
                startedAt: job.started_at,
                completedAt: job.completed_at,
                result: job.output_data,
                error: job.error_message,
            },
        });
    } catch (error) {
        console.error('[PublicAPI] Job status error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get job status' } });
    }
});

// ============================================================================
// POST /api/public/keys — Generate API key (requires JWT auth via dashboard)
// ============================================================================

router.post('/keys', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateApiKeySchema.safeParse(req.body);
        if (!parsed.success) { validationError(res, parsed.error.issues); return; }

        const { name, permissions, expiresInDays } = parsed.data;
        const rawKey = `gm_${crypto.randomBytes(24).toString('hex')}`;
        const keyPrefix = rawKey.slice(0, 10);
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
            : null;

        const result = await query(
            `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, key_prefix, permissions, is_active, expires_at, created_at`,
            [req.user!.userId, name, keyHash, keyPrefix, permissions, expiresAt]
        );

        res.status(201).json({
            data: { ...result.rows[0], key: rawKey },
            meta: { warning: 'Save this API key now. It cannot be retrieved again.' },
        });
    } catch (error) {
        console.error('[PublicAPI] Create key error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create API key' } });
    }
});

// ============================================================================
// GET /api/public/keys — List user's API keys (redacted)
// ============================================================================

router.get('/keys', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT id, name, key_prefix, permissions, is_active, last_used_at, expires_at, created_at
             FROM api_keys WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user!.userId]
        );

        res.json({
            data: result.rows.map(key => ({
                ...key,
                key_preview: `${key.key_prefix}${'*'.repeat(38)}`,
            })),
        });
    } catch (error) {
        console.error('[PublicAPI] List keys error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch API keys' } });
    }
});

// ============================================================================
// DELETE /api/public/keys/:id — Revoke an API key
// ============================================================================

router.delete('/keys/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const idParsed = z.string().uuid().safeParse(req.params.id);
        if (!idParsed.success) { validationError(res, idParsed.error.issues); return; }

        const result = await query(
            'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
            return;
        }

        res.json({ data: { message: 'API key revoked successfully' } });
    } catch (error) {
        console.error('[PublicAPI] Delete key error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke API key' } });
    }
});

export default router;
