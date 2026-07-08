// ============================================================================
// Webhooks Management Routes
// Full CRUD for webhook subscriptions with secret management
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query } from '../db/client.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import { deliverWebhook } from '../lib/webhook-delivery.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateWebhookSchema = z.object({
    name: z.string().min(1).max(255),
    url: z.string().url(),
    events: z.array(z.enum([
        'paper.created', 'paper.deleted',
        'gap.created', 'gap.resolved', 'gap.voted',
        'collection.created', 'collection.updated',
        'alert.triggered',
    ])).min(1),
});

const UpdateWebhookSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    url: z.string().url().optional(),
    events: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
});

// ============================================================================
// GET /webhooks — List user's webhooks
// ============================================================================

router.get('/', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT id, name, url, events, is_active, failure_count, last_triggered_at, created_at
             FROM webhooks
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user!.userId]
        );

        res.json({ webhooks: result.rows });
    } catch (error) {
        console.error('[Webhooks] List error:', error);
        res.status(500).json({ error: 'Failed to fetch webhooks' });
    }
});

// ============================================================================
// POST /webhooks — Create webhook
// ============================================================================

router.post('/', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateWebhookSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { name, url, events } = parsed.data;
        const secret = crypto.randomBytes(32).toString('hex');

        const result = await query(
            `INSERT INTO webhooks (user_id, name, url, secret, events)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, url, events, is_active, created_at`,
            [req.user!.userId, name, url, secret, events]
        );

        // Return secret only on creation — user must save it
        res.status(201).json({
            webhook: result.rows[0],
            secret,
            message: 'Save the secret! It will not be shown again.',
        });
    } catch (error) {
        console.error('[Webhooks] Create error:', error);
        res.status(500).json({ error: 'Failed to create webhook' });
    }
});

// ============================================================================
// PATCH /webhooks/:id — Update webhook
// ============================================================================

router.patch('/:id', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateWebhookSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const data = parsed.data;
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(data.name);
        }
        if (data.url !== undefined) {
            updates.push(`url = $${paramIndex++}`);
            params.push(data.url);
        }
        if (data.events !== undefined) {
            updates.push(`events = $${paramIndex++}`);
            params.push(data.events);
        }
        if (data.isActive !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(data.isActive);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        params.push(req.params.id, req.user!.userId);

        const result = await query(
            `UPDATE webhooks 
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
             RETURNING id, name, url, events, is_active, failure_count, created_at`,
            params
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found' });
            return;
        }

        res.json({ webhook: result.rows[0] });
    } catch (error) {
        console.error('[Webhooks] Update error:', error);
        res.status(500).json({ error: 'Failed to update webhook' });
    }
});

// ============================================================================
// DELETE /webhooks/:id — Delete webhook
// ============================================================================

router.delete('/:id', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `DELETE FROM webhooks WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found' });
            return;
        }

        res.json({ message: 'Webhook deleted' });
    } catch (error) {
        console.error('[Webhooks] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete webhook' });
    }
});

// ============================================================================
// POST /webhooks/:id/test — Send test webhook (tracked in delivery history)
// ============================================================================

router.post('/:id/test', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const webhookResult = await query(
            `SELECT id FROM webhooks WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );

        if (webhookResult.rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found' });
            return;
        }

        const deliveryId = await deliverWebhook(req.params.id as string, 'webhook.test', {
            message: 'This is a test webhook from GapMiner',
            webhookId: req.params.id,
        });

        const delivery = await query(
            `SELECT success, response_status FROM webhook_deliveries WHERE id = $1`,
            [deliveryId]
        );
        const result = delivery.rows[0];

        res.json({
            success: result.success,
            statusCode: result.response_status,
            deliveryId,
            message: result.success ? 'Test webhook sent successfully' : 'Webhook endpoint returned an error',
        });
    } catch (error) {
        console.error('[Webhooks] Test error:', error);
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});

// ============================================================================
// POST /webhooks/:id/dispatch — Dispatch a real event (internal use)
// ============================================================================

router.post('/:id/dispatch', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { event, payload } = req.body;
        if (!event || !payload) {
            res.status(400).json({ error: 'event and payload are required' });
            return;
        }

        const webhookResult = await query(
            `SELECT id, events FROM webhooks WHERE id = $1 AND user_id = $2 AND is_active = true`,
            [req.params.id, req.user!.userId]
        );

        if (webhookResult.rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found or inactive' });
            return;
        }

        const webhook = webhookResult.rows[0];
        if (!webhook.events.includes(event)) {
            res.status(400).json({ error: `Webhook is not subscribed to event '${event}'` });
            return;
        }

        const deliveryId = await deliverWebhook(req.params.id as string, event, payload);

        res.json({ deliveryId, message: 'Event dispatched' });
    } catch (error) {
        console.error('[Webhooks] Dispatch error:', error);
        res.status(500).json({ error: 'Failed to dispatch event' });
    }
});

// ============================================================================
// POST /webhooks/:id/rotate-secret — Rotate webhook secret
// ============================================================================

router.post('/:id/rotate-secret', requireAuth, requireFeature('webhooks'), async (req: Request, res: Response): Promise<void> => {
    try {
        const newSecret = crypto.randomBytes(32).toString('hex');

        const result = await query(
            `UPDATE webhooks SET secret = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name`,
            [newSecret, req.params.id, req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found' });
            return;
        }

        res.json({
            webhook: result.rows[0],
            secret: newSecret,
            message: 'New secret generated. Save it — it will not be shown again.',
        });
    } catch (error) {
        console.error('[Webhooks] Rotate secret error:', error);
        res.status(500).json({ error: 'Failed to rotate secret' });
    }
});

export default router;
