// ============================================================================
// Webhooks Management Routes
// Full CRUD for webhook subscriptions with secret management
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

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

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
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

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
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

router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
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

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
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
// POST /webhooks/:id/test — Send test webhook
// ============================================================================

router.post('/:id/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const webhookResult = await query(
            `SELECT * FROM webhooks WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );

        if (webhookResult.rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found' });
            return;
        }

        const webhook = webhookResult.rows[0];
        const testPayload = {
            event: 'webhook.test',
            timestamp: new Date().toISOString(),
            data: {
                message: 'This is a test webhook from GapMiner',
                webhookId: webhook.id,
            },
        };

        // Sign payload
        const signature = crypto
            .createHmac('sha256', webhook.secret)
            .update(JSON.stringify(testPayload))
            .digest('hex');

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-GapMiner-Signature': signature,
                    'X-GapMiner-Event': 'webhook.test',
                },
                body: JSON.stringify(testPayload),
                signal: AbortSignal.timeout(10000),
            });

            // Reset failure count on successful test
            if (response.ok) {
                await query(
                    `UPDATE webhooks SET failure_count = 0, last_triggered_at = NOW() WHERE id = $1`,
                    [webhook.id]
                );
            }

            res.json({
                success: response.ok,
                statusCode: response.status,
                message: response.ok ? 'Test webhook sent successfully' : 'Webhook endpoint returned an error',
            });
        } catch (fetchError: any) {
            await query(
                `UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = $1`,
                [webhook.id]
            );

            res.json({
                success: false,
                message: `Failed to reach webhook URL: ${fetchError.message}`,
            });
        }
    } catch (error) {
        console.error('[Webhooks] Test error:', error);
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});

// ============================================================================
// POST /webhooks/:id/rotate-secret — Rotate webhook secret
// ============================================================================

router.post('/:id/rotate-secret', requireAuth, async (req: Request, res: Response): Promise<void> => {
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
