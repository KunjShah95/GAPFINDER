// ============================================================================
// API Usage Routes
// Track API usage for quota management and billing
// ============================================================================

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

// ============================================================================
// GET /api/api-keys/usage — Get API usage stats
// ============================================================================

router.get('/usage', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const period = (req.query.period as string) || 'month';

        let startDate = new Date();
        switch (period) {
            case 'day':
                startDate.setDate(startDate.getDate() - 1);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
            default:
                startDate.setDate(startDate.getDate() - 30);
                break;
        }

        // Get usage records
        const usageResult = await query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as requests,
                COALESCE(SUM(tokens_used), 0) as tokens,
                COALESCE(SUM(cost), 0) as cost,
                AVG(response_time_ms) as avg_response_time
            FROM api_usage_logs
            WHERE user_id = $1 AND created_at >= $2
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `, [userId, startDate]);

        // Get totals
        const totalsResult = await query(`
            SELECT 
                COUNT(*) as total_requests,
                COALESCE(SUM(tokens_used), 0) as total_tokens,
                COALESCE(SUM(cost), 0) as total_cost,
                COALESCE(AVG(response_time_ms), 0) as avg_response_time,
                COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 400) as success_count
            FROM api_usage_logs
            WHERE user_id = $1 AND created_at >= $2
        `, [userId, startDate]);

        const totals = totalsResult.rows[0];
        const usageByDay = usageResult.rows;

        const successRate = totals.total_requests > 0 
            ? Math.round((totals.success_count / totals.total_requests) * 100) 
            : 100;

        // Get top endpoints
        const endpointsResult = await query(`
            SELECT 
                endpoint,
                COUNT(*) as count
            FROM api_usage_logs
            WHERE user_id = $1 AND created_at >= $2
            GROUP BY endpoint
            ORDER BY count DESC
            LIMIT 5
        `, [userId, startDate]);

        res.json({
            totalRequests: parseInt(totals.total_requests) || 0,
            totalTokens: parseInt(totals.total_tokens) || 0,
            totalCost: parseFloat(totals.total_cost) || 0,
            avgResponseTime: Math.round(parseFloat(totals.avg_response_time) || 0),
            successRate,
            topEndpoints: endpointsResult.rows,
            usageByDay,
        });
    } catch (error) {
        console.error('[API Usage] Get error:', error);
        res.status(500).json({ error: 'Failed to get API usage' });
    }
});

// ============================================================================
// POST /api/api-keys/usage — Log API usage (internal use)
// ============================================================================

router.post('/usage', async (req: Request, res: Response): Promise<void> => {
    try {
        const apiKey = req.headers['x-api-key'] as string;
        
        if (!apiKey) {
            res.status(401).json({ error: 'API key required' });
            return;
        }

        // Validate API key
        const keyResult = await query(`
            SELECT ak.id, ak.user_id, ak.is_active, ak.expires_at
            FROM api_keys ak
            WHERE (ak.key_prefix || '_' || SUBSTRING(ak.key_hash, 11)) = $1
               OR ak.key_prefix = $1
            LIMIT 1
        `, [apiKey.substring(0, 10)]);

        if (keyResult.rows.length === 0 || !keyResult.rows[0].is_active) {
            res.status(401).json({ error: 'Invalid or inactive API key' });
            return;
        }

        const key = keyResult.rows[0];

        // Check if key is expired
        if (key.expires_at && new Date(key.expires_at) < new Date()) {
            res.status(401).json({ error: 'API key expired' });
            return;
        }

        const { endpoint, method, statusCode, responseTime, tokensUsed } = req.body;

        // Calculate cost
        const cost = calculateCost(tokensUsed || 0, endpoint);

        // Log usage
        await query(`
            INSERT INTO api_usage_logs (
                api_key_id, user_id, endpoint, method, status_code, 
                response_time_ms, tokens_used, cost, ip_address
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [key.id, key.user_id, endpoint, method, statusCode, responseTime, tokensUsed || 0, cost, req.ip]);

        // Update API key last used
        await query(`
            UPDATE api_keys
            SET last_used_at = NOW()
            WHERE id = $1
        `, [key.id]);

        res.json({ success: true, cost });
    } catch (error) {
        console.error('[API Usage] Log error:', error);
        res.status(500).json({ error: 'Failed to log usage' });
    }
});

function calculateCost(tokensUsed: number, endpoint: string): number {
    const tokenRate = 0.0001;
    const baseRate = endpoint?.includes('search') ? 0.01 : 0.001;
    return baseRate + (tokensUsed * tokenRate / 1000);
}

export default router;
