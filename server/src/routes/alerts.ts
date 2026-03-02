// ============================================================================
// Research Alerts Routes
// Create and manage research alerts for new papers matching interests
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateAlertSchema = z.object({
    query: z.string().min(3).max(200),
    frequency: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
    sources: z.array(z.enum(['arxiv', 'semantic_scholar'])).default(['arxiv']),
    matchType: z.enum(['keyword', 'author', 'venue']).default('keyword'),
    isActive: z.boolean().optional().default(true)
});

const UpdateAlertSchema = CreateAlertSchema.partial();

// ============================================================================
// GET /api/alerts — List user's alerts
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `SELECT ra.*, 
                    (SELECT COUNT(*) FROM alert_notifications WHERE alert_id = ra.id) as notification_count,
                    (SELECT COUNT(*) FROM alert_notifications WHERE alert_id = ra.id AND is_read = FALSE) as unread_count,
                    ra.last_triggered_at
             FROM research_alerts ra
             WHERE ra.user_id = $1
             ORDER BY ra.created_at DESC`,
            [userId]
        );

        res.json({ alerts: result.rows });
    } catch (error) {
        console.error('[Alerts] List error:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

// ============================================================================
// POST /api/alerts — Create new alert
// ============================================================================

// Alert limits per subscription tier (must match frontend TIER_LIMITS)
const ALERT_TIER_LIMITS: Record<string, number> = {
    free: 3,
    pro: 20,
    team: 50,
    enterprise: -1, // unlimited
};

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateAlertSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { query: alertQuery, frequency, sources, matchType, isActive } = parsed.data;
        const userId = req.user!.userId;
        const tier = req.user!.tier ?? 'free';
        const maxAlerts = ALERT_TIER_LIMITS[tier] ?? 3;

        // Enforce per-tier alert limit
        if (maxAlerts !== -1) {
            const countResult = await query(
                `SELECT COUNT(*) AS total FROM research_alerts WHERE user_id = $1`,
                [userId]
            );
            const currentCount = parseInt(countResult.rows[0]?.total ?? '0', 10);
            if (currentCount >= maxAlerts) {
                res.status(403).json({
                    error: 'Alert limit reached',
                    message: `Your ${tier} plan allows a maximum of ${maxAlerts} research alerts. Upgrade your plan to create more.`,
                    limit: maxAlerts,
                    current: currentCount,
                    upgradeRequired: true,
                });
                return;
            }
        }

        const result = await query(
            `INSERT INTO research_alerts (user_id, query, frequency, sources, match_type, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [userId, alertQuery, frequency, sources, matchType, isActive]
        );

        res.status(201).json({ alert: result.rows[0], message: 'Alert created' });
    } catch (error) {
        console.error('[Alerts] Create error:', error);
        res.status(500).json({ error: 'Failed to create alert' });
    }
});

// ============================================================================
// PATCH /api/alerts/:id — Update alert
// ============================================================================

router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateAlertSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const userId = req.user!.userId;
        const data = parsed.data;

        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (data.query !== undefined) {
            updates.push(`query = $${paramIndex++}`);
            params.push(data.query);
        }
        if (data.frequency !== undefined) {
            updates.push(`frequency = $${paramIndex++}`);
            params.push(data.frequency);
        }
        if (data.sources !== undefined) {
            updates.push(`sources = $${paramIndex++}`);
            params.push(data.sources);
        }
        if (data.matchType !== undefined) {
            updates.push(`match_type = $${paramIndex++}`);
            params.push(data.matchType);
        }
        if (data.isActive !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(data.isActive);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        params.push(req.params.id, userId);

        const result = await query(
            `UPDATE research_alerts 
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
             RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Alert not found' });
            return;
        }

        res.json({ alert: result.rows[0] });
    } catch (error) {
        console.error('[Alerts] Update error:', error);
        res.status(500).json({ error: 'Failed to update alert' });
    }
});

// ============================================================================
// DELETE /api/alerts/:id — Delete alert
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `DELETE FROM research_alerts 
             WHERE id = $1 AND user_id = $2 
             RETURNING id`,
            [req.params.id, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Alert not found' });
            return;
        }

        res.json({ message: 'Alert deleted' });
    } catch (error) {
        console.error('[Alerts] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete alert' });
    }
});

// ============================================================================
// POST /api/alerts/:id/test — Test alert (trigger manually)
// ============================================================================

router.post('/:id/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const alertResult = await query(
            `SELECT * FROM research_alerts WHERE id = $1 AND user_id = $2`,
            [req.params.id, userId]
        );

        if (alertResult.rows.length === 0) {
            res.status(404).json({ error: 'Alert not found' });
            return;
        }

        const alert = alertResult.rows[0];

        // Create a test notification
        await query(
            `INSERT INTO alert_notifications (alert_id, title, body, notification_type)
             VALUES ($1, $2, $3, 'in_app')`,
            [alert.id, `Test Alert: ${alert.query}`, 'This is a test notification for your alert.']
        );

        res.json({ message: 'Test notification created' });
    } catch (error) {
        console.error('[Alerts] Test error:', error);
        res.status(500).json({ error: 'Failed to test alert' });
    }
});

// ============================================================================
// GET /api/alerts/:id/notifications — Get notifications for alert
// ============================================================================

router.get('/:id/notifications', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;

        // Verify alert belongs to user
        const alertCheck = await query(
            'SELECT id FROM research_alerts WHERE id = $1 AND user_id = $2',
            [req.params.id, userId]
        );

        if (alertCheck.rows.length === 0) {
            res.status(404).json({ error: 'Alert not found' });
            return;
        }

        const result = await query(
            `SELECT an.*, p.title as paper_title, p.url as paper_url
             FROM alert_notifications an
             LEFT JOIN papers p ON p.id = an.paper_id
             WHERE an.alert_id = $1
             ORDER BY an.created_at DESC
             LIMIT $2 OFFSET $3`,
            [req.params.id, limit, offset]
        );

        res.json({ notifications: result.rows, pagination: { page, limit } });
    } catch (error) {
        console.error('[Alerts] Notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// ============================================================================
// GET /api/notifications — Get all notifications for user
// ============================================================================

router.get('/notifications/all', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;
        const unreadOnly = req.query.unread === 'true';

        let whereClause = 'ra.user_id = $1';
        if (unreadOnly) {
            whereClause += ' AND an.is_read = FALSE';
        }

        const result = await query(
            `SELECT an.*, ra.query as alert_query, p.title as paper_title, p.url as paper_url
             FROM alert_notifications an
             JOIN research_alerts ra ON ra.id = an.alert_id
             LEFT JOIN papers p ON p.id = an.paper_id
             WHERE ${whereClause}
             ORDER BY an.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        // Get unread count
        const unreadResult = await query(
            `SELECT COUNT(*) as count 
             FROM alert_notifications an
             JOIN research_alerts ra ON ra.id = an.alert_id
             WHERE ra.user_id = $1 AND an.is_read = FALSE`,
            [userId]
        );

        res.json({ 
            notifications: result.rows, 
            unreadCount: parseInt(unreadResult.rows[0].count),
            pagination: { page, limit } 
        });
    } catch (error) {
        console.error('[Alerts] All notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// ============================================================================
// PATCH /api/notifications/:id/read — Mark notification as read
// ============================================================================

router.patch('/notifications/:id/read', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `UPDATE alert_notifications 
             SET is_read = TRUE
             WHERE id = $1 AND alert_id IN (SELECT id FROM research_alerts WHERE user_id = $2)
             RETURNING *`,
            [req.params.id, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Notification not found' });
            return;
        }

        res.json({ notification: result.rows[0] });
    } catch (error) {
        console.error('[Alerts] Mark read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// ============================================================================
// POST /api/notifications/read-all — Mark all as read
// ============================================================================

router.post('/notifications/read-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        await query(
            `UPDATE alert_notifications 
             SET is_read = TRUE
             WHERE alert_id IN (SELECT id FROM research_alerts WHERE user_id = $1) AND is_read = FALSE`,
            [userId]
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('[Alerts] Mark all read error:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// ============================================================================
// GET /api/alerts/preferences — Get notification preferences
// ============================================================================

router.get('/preferences', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        const result = await query(
            `SELECT * FROM notification_preferences WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            // Return defaults
            res.json({
                preferences: {
                    emailAlerts: true,
                    pushAlerts: true,
                    inAppAlerts: true,
                    alertFrequency: 'daily',
                    notifyOnGaps: true,
                    notifyOnPapers: true,
                    notifyOnCommunity: true
                }
            });
            return;
        }

        const p = result.rows[0];
        res.json({
            preferences: {
                emailAlerts: p.email_alerts,
                pushAlerts: p.push_alerts,
                inAppAlerts: p.in_app_alerts,
                alertFrequency: p.alert_frequency,
                notifyOnGaps: p.notify_on_gaps,
                notifyOnPapers: p.notify_on_papers,
                notifyOnCommunity: p.notify_on_community
            }
        });
    } catch (error) {
        console.error('[Alerts] Preferences error:', error);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
});

// ============================================================================
// PUT /api/alerts/preferences — Update notification preferences
// ============================================================================

router.put('/preferences', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const {
            emailAlerts,
            pushAlerts,
            inAppAlerts,
            alertFrequency,
            notifyOnGaps,
            notifyOnPapers,
            notifyOnCommunity
        } = req.body;

        await query(
            `INSERT INTO notification_preferences (user_id, email_alerts, push_alerts, in_app_alerts, alert_frequency, notify_on_gaps, notify_on_papers, notify_on_community)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (user_id) DO UPDATE SET
                email_alerts = $2,
                push_alerts = $3,
                in_app_alerts = $4,
                alert_frequency = $5,
                notify_on_gaps = $6,
                notify_on_papers = $7,
                notify_on_community = $8,
                updated_at = NOW()`,
            [userId, emailAlerts, pushAlerts, inAppAlerts, alertFrequency, notifyOnGaps, notifyOnPapers, notifyOnCommunity]
        );

        res.json({ message: 'Preferences updated' });
    } catch (error) {
        console.error('[Alerts] Update preferences error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

export default router;
