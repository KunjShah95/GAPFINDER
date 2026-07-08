// ============================================================================
// Webhook Delivery History & Debugging Routes
// ============================================================================

import { Router, Request, Response } from 'express';
import { query } from '../db/client.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import { retryDelivery } from '../lib/webhook-delivery.js';

const router = Router();

// ============================================================================
// GET /webhooks/:id/deliveries — List delivery attempts for a webhook
// ============================================================================

router.get('/:id/deliveries', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify webhook ownership
        const webhookCheck = await query(
            `SELECT id FROM webhooks WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        if (webhookCheck.rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found' });
            return;
        }

        const { success, event, limit = '50', offset = '0' } = req.query;

        let whereClause = 'WHERE webhook_id = $1';
        const params: any[] = [req.params.id];
        let paramIndex = 2;

        if (success !== undefined) {
            whereClause += ` AND success = $${paramIndex++}`;
            params.push(success === 'true');
        }
        if (event) {
            whereClause += ` AND event = $${paramIndex++}`;
            params.push(event);
        }

        const limitNum = Math.min(parseInt(limit as string) || 50, 100);
        const offsetNum = parseInt(offset as string) || 0;

        const result = await query(
            `SELECT id, event, response_status, success, error,
                    response_time_ms, attempts, next_retry_at, created_at
             FROM webhook_deliveries
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
            [...params, limitNum, offsetNum]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM webhook_deliveries ${whereClause}`,
            params
        );

        res.json({
            deliveries: result.rows,
            total: parseInt(countResult.rows[0].total),
            limit: limitNum,
            offset: offsetNum,
        });
    } catch (error) {
        console.error('[WebhookDeliveries] List error:', error);
        res.status(500).json({ error: 'Failed to fetch deliveries' });
    }
});

// ============================================================================
// GET /webhooks/deliveries/:deliveryId — Get delivery detail
// ============================================================================

router.get('/deliveries/:deliveryId', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT d.*, w.user_id
             FROM webhook_deliveries d
             JOIN webhooks w ON w.id = d.webhook_id
             WHERE d.id = $1`,
            [req.params.deliveryId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Delivery not found' });
            return;
        }

        const delivery = result.rows[0];
        if (delivery.user_id !== req.user!.userId) {
            res.status(404).json({ error: 'Delivery not found' });
            return;
        }

        res.json({ delivery });
    } catch (error) {
        console.error('[WebhookDeliveries] Detail error:', error);
        res.status(500).json({ error: 'Failed to fetch delivery detail' });
    }
});

// ============================================================================
// POST /webhooks/deliveries/:deliveryId/retry — Retry a failed delivery
// ============================================================================

router.post('/deliveries/:deliveryId/retry', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify ownership
        const ownershipCheck = await query(
            `SELECT d.id, d.success, d.webhook_id, w.user_id
             FROM webhook_deliveries d
             JOIN webhooks w ON w.id = d.webhook_id
             WHERE d.id = $1`,
            [req.params.deliveryId]
        );

        if (ownershipCheck.rows.length === 0) {
            res.status(404).json({ error: 'Delivery not found' });
            return;
        }

        const delivery = ownershipCheck.rows[0];
        if (delivery.user_id !== req.user!.userId) {
            res.status(404).json({ error: 'Delivery not found' });
            return;
        }

        if (delivery.success) {
            res.status(400).json({ error: 'Cannot retry a successful delivery' });
            return;
        }

        const newDeliveryId = await retryDelivery(req.params.deliveryId as string);

        res.json({
            message: 'Retry initiated',
            newDeliveryId,
        });
    } catch (error: any) {
        console.error('[WebhookDeliveries] Retry error:', error);
        res.status(400).json({ error: error.message || 'Failed to retry delivery' });
    }
});

// ============================================================================
// GET /webhooks/:id/stats — Delivery statistics
// ============================================================================

router.get('/:id/stats', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const webhookCheck = await query(
            `SELECT id FROM webhooks WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        if (webhookCheck.rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found' });
            return;
        }

        const [overviewResult, byEventResult, dailyResult] = await Promise.all([
            query(
                `SELECT
                    COUNT(*) as total_deliveries,
                    COUNT(*) FILTER (WHERE success = true) as successful,
                    COUNT(*) FILTER (WHERE success = false) as failed,
                    ROUND(AVG(response_time_ms)::numeric, 0) as avg_response_time_ms,
                    COUNT(*) FILTER (WHERE next_retry_at IS NOT NULL) as pending_retries
                 FROM webhook_deliveries
                 WHERE webhook_id = $1`,
                [req.params.id]
            ),
            query(
                `SELECT
                    event,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE success = true) as successful,
                    COUNT(*) FILTER (WHERE success = false) as failed
                 FROM webhook_deliveries
                 WHERE webhook_id = $1
                 GROUP BY event
                 ORDER BY total DESC`,
                [req.params.id]
            ),
            query(
                `SELECT
                    DATE(created_at) as date,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE success = true) as successful,
                    COUNT(*) FILTER (WHERE success = false) as failed
                 FROM webhook_deliveries
                 WHERE webhook_id = $1
                   AND created_at >= NOW() - INTERVAL '30 days'
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC`,
                [req.params.id]
            ),
        ]);

        const overview = overviewResult.rows[0];
        const successRate = overview.total_deliveries > 0
            ? Math.round((overview.successful / overview.total_deliveries) * 10000) / 100
            : 0;

        res.json({
            overview: {
                totalDeliveries: parseInt(overview.total_deliveries),
                successful: parseInt(overview.successful),
                failed: parseInt(overview.failed),
                successRate,
                avgResponseTimeMs: parseInt(overview.avg_response_time_ms) || 0,
                pendingRetries: parseInt(overview.pending_retries),
            },
            byEvent: byEventResult.rows.map((r: any) => ({
                event: r.event,
                total: parseInt(r.total),
                successful: parseInt(r.successful),
                failed: parseInt(r.failed),
            })),
            daily: dailyResult.rows.map((r: any) => ({
                date: r.date,
                total: parseInt(r.total),
                successful: parseInt(r.successful),
                failed: parseInt(r.failed),
            })),
        });
    } catch (error) {
        console.error('[WebhookDeliveries] Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch delivery stats' });
    }
});

export default router;
