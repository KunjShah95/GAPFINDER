// ============================================================================
// Admin Routes
// Platform administration: stats, user management, revenue, system health
// ============================================================================

import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { query } from '../db/client.js';
import { redisClient } from '../queues/redis.js';
import { checkHealth } from '../db/client.js';
import { logAuditEvent, getClientInfo, AuditActions } from '../lib/audit-trail.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(requireAuth, requireAdmin);

// ============================================================================
// GET /admin/stats — Platform statistics
// ============================================================================

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
    try {
        const [
            totalUsers,
            activeUsers7d,
            activeUsers30d,
            totalPapers,
            totalGaps,
            totalCollections,
            revenueResult,
            apiCallsToday,
            apiCallsMonth,
            llmCostResult,
        ] = await Promise.all([
            // Total users
            query(`SELECT COUNT(*) as count FROM users`),

            // Active users (last 7 days) — based on last_login_at or usage_events
            query(`SELECT COUNT(DISTINCT user_id) as count FROM usage_events WHERE created_at > NOW() - INTERVAL '7 days'`),

            // Active users (last 30 days)
            query(`SELECT COUNT(DISTINCT user_id) as count FROM usage_events WHERE created_at > NOW() - INTERVAL '30 days'`),

            // Total papers
            query(`SELECT COUNT(*) as count FROM papers`),

            // Total gaps
            query(`SELECT COUNT(*) as count FROM gaps`),

            // Total collections
            query(`SELECT COUNT(*) as count FROM collections`),

            // Revenue from active subscriptions
            query(`
                SELECT 
                    COALESCE(SUM(
                        CASE tier
                            WHEN 'pro' THEN 29
                            WHEN 'team' THEN 79
                            WHEN 'enterprise' THEN 199
                            ELSE 0
                        END
                    ), 0) as mrr,
                    COUNT(*) as active_subs
                FROM subscriptions WHERE status = 'active'
            `),

            // API calls today
            query(`SELECT COUNT(*) as count FROM api_usage_logs WHERE created_at >= CURRENT_DATE`),

            // API calls this month
            query(`SELECT COUNT(*) as count FROM api_usage_logs WHERE created_at >= date_trunc('month', NOW())`),

            // LLM cost estimate (current month)
            query(`SELECT COALESCE(SUM(cost), 0) as total_cost FROM llm_call_logs WHERE created_at >= date_trunc('month', NOW())`),
        ]);

        res.json({
            totalUsers: parseInt(totalUsers.rows[0].count),
            activeUsers7d: parseInt(activeUsers7d.rows[0].count),
            activeUsers30d: parseInt(activeUsers30d.rows[0].count),
            totalPapers: parseInt(totalPapers.rows[0].count),
            totalGaps: parseInt(totalGaps.rows[0].count),
            totalCollections: parseInt(totalCollections.rows[0].count),
            monthlyRevenue: parseInt(revenueResult.rows[0].mrr),
            activeSubscriptions: parseInt(revenueResult.rows[0].active_subs),
            apiCallsToday: parseInt(apiCallsToday.rows[0].count),
            apiCallsMonth: parseInt(apiCallsMonth.rows[0].count),
            llmCostMonth: parseFloat(llmCostResult.rows[0].total_cost),
        });
    } catch (error) {
        console.error('[Admin] Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============================================================================
// GET /admin/users — List all users with subscription info
// ============================================================================

router.get('/users', async (req: Request, res: Response): Promise<void> => {
    try {
        const search = (req.query.search as string) || '';
        const tier = (req.query.tier as string) || '';
        const sort = (req.query.sort as string) || 'created_at';
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = parseInt(req.query.offset as string) || 0;

        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (search) {
            conditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (tier) {
            conditions.push(`s.tier = $${paramIndex}`);
            params.push(tier);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Sanitize sort column
        const allowedSorts: Record<string, string> = {
            created_at: 'u.created_at',
            name: 'u.name',
            email: 'u.email',
            last_active: 'u.last_login_at',
            tier: 's.tier',
        };
        const sortColumn = allowedSorts[sort] || 'u.created_at';

        const countResult = await query(
            `SELECT COUNT(*) as total
             FROM users u
             LEFT JOIN subscriptions s ON s.user_id = u.id
             ${whereClause}`,
            params
        );

        const result = await query(
            `SELECT 
                u.id, u.email, u.name, u.role, u.is_verified,
                u.last_login_at, u.created_at,
                s.tier, s.status as subscription_status, s.current_period_end,
                (SELECT COUNT(*) FROM papers WHERE user_id = u.id) as paper_count,
                (SELECT COUNT(*) FROM gaps WHERE user_id = u.id) as gap_count
             FROM users u
             LEFT JOIN subscriptions s ON s.user_id = u.id
             ${whereClause}
             ORDER BY ${sortColumn} DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        res.json({
            users: result.rows.map(row => ({
                id: row.id,
                email: row.email,
                name: row.name,
                role: row.role,
                isVerified: row.is_verified,
                lastActive: row.last_login_at,
                createdAt: row.created_at,
                tier: row.tier || 'free',
                subscriptionStatus: row.subscription_status,
                periodEnd: row.current_period_end,
                paperCount: parseInt(row.paper_count),
                gapCount: parseInt(row.gap_count),
            })),
            total: parseInt(countResult.rows[0].total),
            limit,
            offset,
        });
    } catch (error) {
        console.error('[Admin] Users list error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ============================================================================
// GET /admin/users/:id — User detail
// ============================================================================

router.get('/users/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const [userResult, usageResult, subscriptionResult, recentPapers, recentGaps] = await Promise.all([
            query(
                `SELECT u.id, u.email, u.name, u.role, u.is_verified, u.last_login_at, u.created_at, u.updated_at,
                        s.tier, s.status as subscription_status, s.current_period_start, s.current_period_end,
                        s.cancel_at_period_end, s.payment_provider
                 FROM users u
                 LEFT JOIN subscriptions s ON s.user_id = u.id
                 WHERE u.id = $1`,
                [id]
            ),
            query(
                `SELECT papers_processed, gaps_extracted, api_calls, export_count, period_start, period_end
                 FROM usage_records
                 WHERE user_id = $1
                 ORDER BY period_start DESC
                 LIMIT 12`,
                [id]
            ),
            query(
                `SELECT tier, status, created_at FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
                [id]
            ),
            query(
                `SELECT id, title, venue, year, created_at FROM papers WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
                [id]
            ),
            query(
                `SELECT id, problem, type, impact_score, is_resolved, created_at FROM gaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
                [id]
            ),
        ]);

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const user = userResult.rows[0];

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isVerified: user.is_verified,
                lastActive: user.last_login_at,
                createdAt: user.created_at,
                updatedAt: user.updated_at,
            },
            subscription: {
                tier: user.tier || 'free',
                status: user.subscription_status,
                currentPeriodStart: user.current_period_start,
                currentPeriodEnd: user.current_period_end,
                cancelAtPeriodEnd: user.cancel_at_period_end,
                paymentProvider: user.payment_provider,
                history: subscriptionResult.rows,
            },
            usage: usageResult.rows,
            recentPapers: recentPapers.rows,
            recentGaps: recentGaps.rows,
        });
    } catch (error) {
        console.error('[Admin] User detail error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// ============================================================================
// PATCH /admin/users/:id — Update user (tier, role, disable)
// ============================================================================

router.patch('/users/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { tier, role, isVerified } = req.body;
        const adminId = req.user!.userId;

        // Prevent self-demotion
        if (id === adminId && role && role !== 'admin') {
            res.status(400).json({ error: 'Cannot change your own admin role' });
            return;
        }

        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (tier !== undefined) {
            updates.push(`tier = $${paramIndex}`);
            params.push(tier);
            paramIndex++;
        }

        if (role !== undefined) {
            updates.push(`role = $${paramIndex}`);
            params.push(role);
            paramIndex++;
        }

        if (isVerified !== undefined) {
            updates.push(`is_verified = $${paramIndex}`);
            params.push(isVerified);
            paramIndex++;
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No updates provided' });
            return;
        }

        // Update user table (role, is_verified)
        const userUpdates = updates.filter(u => u.startsWith('role') || u.startsWith('is_verified'));
        if (userUpdates.length > 0) {
            const userParams = params.filter((_, i) => {
                const update = updates[i];
                return update?.startsWith('role') || update?.startsWith('is_verified');
            });
            await query(
                `UPDATE users SET ${userUpdates.join(', ')} WHERE id = $${paramIndex}`,
                [...userParams, id]
            );
        }

        // Update subscription tier
        if (tier !== undefined) {
            await query(
                `UPDATE subscriptions SET tier = $1, updated_at = NOW() WHERE user_id = $2`,
                [tier, id]
            );
            // If no subscription exists, create one
            const subExists = await query(`SELECT id FROM subscriptions WHERE user_id = $1`, [id]);
            if (subExists.rows.length === 0) {
                await query(
                    `INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, $2, 'active')`,
                    [id, tier]
                );
            }
        }

        // Log the admin action
        await logAuditEvent({
            userId: adminId,
            action: 'admin.user_updated',
            resourceType: 'user',
            resourceId: Array.isArray(id) ? id[0] : id,
            changes: { tier, role, isVerified },
            ...getClientInfo(req),
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Admin] Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ============================================================================
// GET /admin/revenue — Revenue analytics
// ============================================================================

router.get('/revenue', async (req: Request, res: Response): Promise<void> => {
    try {
        const period = (req.query.period as string) || '30d';
        let intervalClause: string;
        switch (period) {
            case '7d': intervalClause = '7 days'; break;
            case '90d': intervalClause = '90 days'; break;
            case '1y': intervalClause = '1 year'; break;
            default: intervalClause = '30 days'; break;
        }

        const [dailyRevenue, tierBreakdown, churnData, totalMRR] = await Promise.all([
            // Daily revenue estimate from active subscriptions created in period
            query(`
                SELECT date_trunc('day', created_at)::date as day,
                       COUNT(*) as new_subs,
                       SUM(CASE tier
                           WHEN 'pro' THEN 29
                           WHEN 'team' THEN 79
                           WHEN 'enterprise' THEN 199
                           ELSE 0
                       END) as estimated_revenue
                FROM subscriptions
                WHERE status = 'active' AND created_at > NOW() - INTERVAL '${intervalClause}'
                GROUP BY day ORDER BY day
            `),

            // Revenue by tier
            query(`
                SELECT tier,
                       COUNT(*) as count,
                       SUM(CASE tier
                           WHEN 'pro' THEN 29
                           WHEN 'team' THEN 79
                           WHEN 'enterprise' THEN 199
                           ELSE 0
                       END) as mrr
                FROM subscriptions WHERE status = 'active'
                GROUP BY tier ORDER BY mrr DESC
            `),

            // Churn (canceled subs in last 30 days)
            query(`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'canceled' AND updated_at > NOW() - INTERVAL '30 days') as canceled_30d,
                    COUNT(*) as total_active,
                    CASE 
                        WHEN COUNT(*) > 0 
                        THEN (COUNT(*) FILTER (WHERE status = 'canceled' AND updated_at > NOW() - INTERVAL '30 days')::decimal / COUNT(*) * 100)::numeric(4,1)
                        ELSE 0
                    END as churn_rate
                FROM subscriptions
            `),

            // Total MRR
            query(`
                SELECT COALESCE(SUM(CASE tier
                    WHEN 'pro' THEN 29
                    WHEN 'team' THEN 79
                    WHEN 'enterprise' THEN 199
                    ELSE 0
                END), 0) as mrr
                FROM subscriptions WHERE status = 'active'
            `),
        ]);

        const mrr = parseInt(totalMRR.rows[0].mrr);

        res.json({
            daily: dailyRevenue.rows,
            byTier: tierBreakdown.rows.map(r => ({
                tier: r.tier,
                count: parseInt(r.count),
                mrr: parseInt(r.mrr),
            })),
            churn: {
                canceled30d: parseInt(churnData.rows[0].canceled_30d),
                totalActive: parseInt(churnData.rows[0].total_active),
                churnRate: parseFloat(churnData.rows[0].churn_rate),
            },
            mrr,
            arr: mrr * 12,
        });
    } catch (error) {
        console.error('[Admin] Revenue error:', error);
        res.status(500).json({ error: 'Failed to fetch revenue data' });
    }
});

// ============================================================================
// GET /admin/system — System health
// ============================================================================

router.get('/system', async (_req: Request, res: Response): Promise<void> => {
    try {
        const [dbHealth, redisStatus, queueDepth, errorRate, llmStatus] = await Promise.all([
            // Database health
            checkHealth(),

            // Redis status
            (async () => {
                try {
                    if (!redisClient.isOpen) {
                        await redisClient.connect();
                    }
                    const pong = await redisClient.ping();
                    return { ok: pong === 'PONG', status: 'connected' };
                } catch {
                    return { ok: false, status: 'disconnected' };
                }
            })(),

            // Queue depth (batch queue)
            (async () => {
                try {
                    const keys = await redisClient.keys('gapminer:llm-batch:*');
                    return { depth: keys.length };
                } catch {
                    return { depth: -1 };
                }
            })(),

            // Error rate (last hour from Sentry-like: use llm_call_logs failures)
            query(`
                SELECT 
                    COUNT(*) FILTER (WHERE success = FALSE) as failures,
                    COUNT(*) as total,
                    CASE WHEN COUNT(*) > 0 
                        THEN (COUNT(*) FILTER (WHERE success = FALSE)::decimal / COUNT(*) * 100)::numeric(4,1)
                        ELSE 0 
                    END as error_rate
                FROM llm_call_logs
                WHERE created_at > NOW() - INTERVAL '1 hour'
            `),

            // LLM provider status (check which are configured)
            (async () => {
                const providers: Record<string, boolean> = {};
                const envKeys: Record<string, string> = {
                    gemini: 'GEMINI_API_KEY',
                    openai: 'OPENAI_API_KEY',
                    anthropic: 'ANTHROPIC_API_KEY',
                    openrouter: 'OPENROUTER_API_KEY',
                    deepseek: 'DEEPSEEK_API_KEY',
                };
                for (const [name, key] of Object.entries(envKeys)) {
                    providers[name] = !!process.env[key];
                }
                return providers;
            })(),
        ]);

        const errorStats = errorRate.rows[0] || {};

        res.json({
            database: {
                status: dbHealth.ok ? 'healthy' : 'degraded',
                latencyMs: dbHealth.latencyMs,
            },
            redis: redisStatus,
            queue: queueDepth,
            llmProviders: llmStatus,
            errors: {
                failures: parseInt(errorStats.failures || '0'),
                total: parseInt(errorStats.total || '0'),
                errorRate: parseFloat(errorStats.error_rate || '0'),
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        });
    } catch (error) {
        console.error('[Admin] System health error:', error);
        res.status(500).json({ error: 'Failed to fetch system health' });
    }
});

// ============================================================================
// GET /admin/audit — Admin audit log
// ============================================================================

router.get('/audit', async (req: Request, res: Response): Promise<void> => {
    try {
        const action = req.query.action as string;
        const userId = req.query.userId as string;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = parseInt(req.query.offset as string) || 0;

        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (action) {
            conditions.push(`al.action = $${paramIndex++}`);
            params.push(action);
        }
        if (userId) {
            conditions.push(`al.user_id = $${paramIndex++}`);
            params.push(userId);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [countResult, logsResult] = await Promise.all([
            query(
                `SELECT COUNT(*) as total FROM audit_logs al ${whereClause}`,
                params
            ),
            query(
                `SELECT al.id, al.user_id, al.action, al.resource_type, al.resource_id,
                        al.changes, al.ip_address, al.user_agent, al.created_at,
                        u.email as user_email, u.name as user_name
                 FROM audit_logs al
                 LEFT JOIN users u ON u.id = al.user_id
                 ${whereClause}
                 ORDER BY al.created_at DESC
                 LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
                [...params, limit, offset]
            ),
        ]);

        res.json({
            logs: logsResult.rows.map(row => ({
                id: row.id,
                userId: row.user_id,
                userName: row.user_name,
                userEmail: row.user_email,
                action: row.action,
                resourceType: row.resource_type,
                resourceId: row.resource_id,
                changes: row.changes,
                ipAddress: row.ip_address,
                userAgent: row.user_agent,
                createdAt: row.created_at,
            })),
            total: parseInt(countResult.rows[0].total),
            limit,
            offset,
        });
    } catch (error) {
        console.error('[Admin] Audit log error:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

export default router;
