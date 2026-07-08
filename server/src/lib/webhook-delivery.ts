// ============================================================================
// Webhook Delivery Service
// Sends HTTP payloads with HMAC signatures, retries with exponential backoff
// ============================================================================

import crypto from 'crypto';
import { query } from '../db/client.js';

const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [
    60 * 1000,          // 1 minute
    5 * 60 * 1000,      // 5 minutes
    30 * 60 * 1000,     // 30 minutes
    2 * 60 * 60 * 1000, // 2 hours
    // 5th retry handled by max check
];

// ============================================================================
// Deliver a webhook event
// ============================================================================

export async function deliverWebhook(
    webhookId: string,
    event: string,
    payload: Record<string, any>
): Promise<string> {
    // Fetch webhook config
    const webhookResult = await query(
        `SELECT id, url, secret, is_active FROM webhooks WHERE id = $1 AND is_active = true`,
        [webhookId]
    );

    if (webhookResult.rows.length === 0) {
        throw new Error(`Webhook ${webhookId} not found or inactive`);
    }

    const webhook = webhookResult.rows[0];
    const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
    });

    // Sign payload
    const signature = webhook.secret
        ? crypto.createHmac('sha256', webhook.secret).update(body).digest('hex')
        : '';

    // Insert delivery record
    const deliveryResult = await query(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload, attempts)
         VALUES ($1, $2, $3, 1)
         RETURNING id`,
        [webhookId, event, JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })]
    );
    const deliveryId = deliveryResult.rows[0].id;

    // Attempt delivery
    await attemptDelivery(deliveryId, webhook.url, body, signature, event);

    return deliveryId;
}

// ============================================================================
// Retry a delivery
// ============================================================================

export async function retryDelivery(deliveryId: string): Promise<string> {
    // Fetch original delivery + webhook info
    const deliveryResult = await query(
        `SELECT d.id, d.webhook_id, d.event, d.payload, d.attempts, w.url, w.secret
         FROM webhook_deliveries d
         JOIN webhooks w ON w.id = d.webhook_id
         WHERE d.id = $1`,
        [deliveryId]
    );

    if (deliveryResult.rows.length === 0) {
        throw new Error(`Delivery ${deliveryId} not found`);
    }

    const delivery = deliveryResult.rows[0];
    const newAttempt = delivery.attempts + 1;

    if (newAttempt > MAX_RETRIES) {
        throw new Error(`Max retries (${MAX_RETRIES}) exceeded for delivery ${deliveryId}`);
    }

    const payload = delivery.payload;
    const body = JSON.stringify(payload);

    const signature = delivery.secret
        ? crypto.createHmac('sha256', delivery.secret).update(body).digest('hex')
        : '';

    // Create a new delivery record for the retry
    const newDeliveryResult = await query(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload, attempts)
         VALUES ($1, $2, $3, 1)
         RETURNING id`,
        [delivery.webhook_id, delivery.event, JSON.stringify(payload)]
    );
    const newDeliveryId = newDeliveryResult.rows[0].id;

    await attemptDelivery(newDeliveryId, delivery.url, body, signature, delivery.event);

    return newDeliveryId;
}

// ============================================================================
// Internal: attempt HTTP delivery
// ============================================================================

async function attemptDelivery(
    deliveryId: string,
    url: string,
    body: string,
    signature: string,
    event: string
): Promise<void> {
    const startTime = Date.now();

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Webhook-Event': event,
            'X-Webhook-Timestamp': new Date().toISOString(),
        };
        if (signature) {
            headers['X-Webhook-Signature'] = `sha256=${signature}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(15000),
        });

        const responseTimeMs = Date.now() - startTime;
        let responseBody: string | null = null;
        try {
            responseBody = await response.text();
            if (responseBody.length > 10000) responseBody = responseBody.slice(0, 10000);
        } catch { /* body not readable */ }

        const success = response.ok;

        await query(
            `UPDATE webhook_deliveries
             SET response_status = $1, response_body = $2, response_time_ms = $3,
                 success = $4, error = $5, created_at = NOW()
             WHERE id = $6`,
            [response.status, responseBody, responseTimeMs, success, null, deliveryId]
        );

        if (!success) {
            await scheduleRetryIfNeeded(deliveryId, event);
        }
    } catch (error: any) {
        const responseTimeMs = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown delivery error';

        await query(
            `UPDATE webhook_deliveries
             SET response_time_ms = $1, success = false, error = $2
             WHERE id = $3`,
            [responseTimeMs, errorMessage, deliveryId]
        );

        await scheduleRetryIfNeeded(deliveryId, event);
    }
}

// ============================================================================
// Internal: schedule retry with exponential backoff
// ============================================================================

async function scheduleRetryIfNeeded(deliveryId: string, event: string): Promise<void> {
    // Check how many attempts have been made for this webhook
    const attemptsResult = await query(
        `SELECT attempts FROM webhook_deliveries WHERE id = $1`,
        [deliveryId]
    );
    const currentAttempts = attemptsResult.rows[0]?.attempts || 1;

    if (currentAttempts >= MAX_RETRIES) return;

    const delayIndex = Math.min(currentAttempts - 1, RETRY_DELAYS_MS.length - 1);
    const delayMs = RETRY_DELAYS_MS[delayIndex];
    const nextRetryAt = new Date(Date.now() + delayMs);

    await query(
        `UPDATE webhook_deliveries SET next_retry_at = $1 WHERE id = $2`,
        [nextRetryAt, deliveryId]
    );
}
