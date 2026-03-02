// ============================================================================
// API Key Authentication Middleware
// Validates API keys for public API access
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { query } from '../db/client.js';
import crypto from 'crypto';

export interface ApiKeyUser {
    userId: string;
    apiKeyId: string;
    keyId?: string;
    name: string;
    permissions?: string[];
    tier: string;
    rateLimit: number;
    monthlyQuota?: number;
    monthlyUsage: number;
}

declare global {
    namespace Express {
        interface Request {
            apiKey?: ApiKeyUser;
        }
    }
}

export async function requireApiKey(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const apiKeyHeader = req.headers['x-api-key'] as string;

        if (!apiKeyHeader) {
            res.status(401).json({ error: 'API key required. Provide it in X-API-Key header.' });
            return;
        }

        // Find API key (lookup by prefix first for efficiency)
        const prefix = apiKeyHeader.substring(0, 10);
        const result = await query(
            `SELECT ak.id, ak.user_id, ak.name, ak.key_hash, ak.rate_limit, 
                    ak.monthly_quota, ak.monthly_usage, ak.is_active, ak.expires_at, u.email
             FROM api_keys ak
             JOIN users u ON u.id = ak.user_id
             WHERE ak.key_prefix = $1 AND ak.is_active = TRUE`,
            [prefix]
        );

        if (result.rows.length === 0) {
            res.status(401).json({ error: 'Invalid API key' });
            return;
        }

        const apiKey = result.rows[0];

        // Check if key has expired
        if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
            res.status(401).json({ error: 'API key has expired' });
            return;
        }

        // Verify the full key
        const isValid = verifyApiKey(apiKeyHeader, apiKey.key_hash);
        if (!isValid) {
            res.status(401).json({ error: 'Invalid API key' });
            return;
        }

        // Check monthly quota if set
        if (apiKey.monthly_quota && apiKey.monthly_usage >= apiKey.monthly_quota) {
            res.status(429).json({ error: 'Monthly quota exceeded' });
            return;
        }

        // Check rate limit
        const rateLimitResult = await checkRateLimit(apiKey.id, apiKey.rate_limit);
        if (!rateLimitResult.allowed) {
            res.status(429).json({ 
                error: 'Rate limit exceeded',
                retryAfter: rateLimitResult.retryAfter
            });
            return;
        }

        // Get user tier from subscriptions
        const tierResult = await query(
            `SELECT tier FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
            [apiKey.user_id]
        );

        const tier = tierResult.rows[0]?.tier || 'free';

        // Attach API key info to request
        req.apiKey = {
            userId: apiKey.user_id,
            apiKeyId: apiKey.id,
            name: apiKey.name,
            tier,
            rateLimit: apiKey.rate_limit,
            monthlyQuota: apiKey.monthly_quota,
            monthlyUsage: apiKey.monthly_usage
        };

        // Log the API call
        await logApiUsage(apiKey.id, req.path, req.method, 200);

        next();
    } catch (error) {
        console.error('[API Auth] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

function verifyApiKey(providedKey: string, storedHash: string): boolean {
    const keyHash = crypto.createHash('sha256').update(providedKey).digest('hex');
    return keyHash === storedHash;
}

async function checkRateLimit(apiKeyId: string, limit: number): Promise<{ allowed: boolean; retryAfter?: number }> {
    const windowStart = new Date(Date.now() - 60000);
    
    const result = await query(
        `SELECT COUNT(*) as count 
         FROM api_usage_logs 
         WHERE api_key_id = $1 AND created_at > $2`,
        [apiKeyId, windowStart]
    );

    const count = parseInt(result.rows[0].count);
    return {
        allowed: count < limit,
        retryAfter: count >= limit ? 60 : undefined
    };
}

async function logApiUsage(
    apiKeyId: string,
    endpoint: string,
    method: string,
    statusCode: number
): Promise<void> {
    try {
        await query(
            `INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code)
             VALUES ($1, $2, $3, $4)`,
            [apiKeyId, endpoint, method, statusCode]
        );

        await query(
            `UPDATE api_keys SET monthly_usage = monthly_usage + 1 WHERE id = $1`,
            [apiKeyId]
        );
    } catch (error) {
        console.error('[API Usage] Log error:', error);
    }
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
    const key = `gm_${crypto.randomBytes(32).toString('hex')}`;
    const prefix = key.substring(0, 10);
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    
    return { key, prefix, hash };
}
