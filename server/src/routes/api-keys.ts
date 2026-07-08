// ============================================================================
// API Keys Management
// Generate, manage, and rotate API keys for external access
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import { query } from '../db/client.js';
import { logAuditEvent, getClientInfo, AuditActions } from '../lib/audit-trail.js';

const router = Router();

// ============================================================================
// TYPES
// ============================================================================

interface ApiKey {
    id: string;
    name: string;
    keyPrefix: string;
    permissions: string[];
    isActive: boolean;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
}

interface ApiKeyWithSecret extends ApiKey {
    secret: string; // Only returned on creation
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateApiKey(): { prefix: string; secret: string } {
    const secret = `gm_${crypto.randomBytes(32).toString('hex')}`;
    const prefix = secret.substring(0, 10);
    return { prefix, secret };
}

function hashKey(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
}

// ============================================================================
// ROUTES
// ============================================================================

// ============================================================================
// GET /api-keys — List all API keys for user
// ============================================================================

router.get('/', requireAuth, requireFeature('api_access'), async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(`
            SELECT id, name, key_prefix, permissions, is_active, last_used_at, expires_at, created_at
            FROM api_keys
            WHERE user_id = $1
            ORDER BY created_at DESC
        `, [req.user!.userId]);
        
        const keys: ApiKey[] = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            keyPrefix: row.key_prefix,
            permissions: row.permissions || ['read'],
            isActive: row.is_active,
            lastUsedAt: row.last_used_at,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
        }));
        
        res.json({ keys });
    } catch (error) {
        console.error('[API Keys] List error:', error);
        res.status(500).json({ error: 'Failed to list API keys' });
    }
});

// ============================================================================
// POST /api-keys — Create new API key
// ============================================================================

const CreateApiKeySchema = z.object({
    name: z.string().min(1).max(100),
    permissions: z.array(z.enum(['read', 'write', 'admin'])).optional().default(['read']),
    expiresInDays: z.number().min(1).max(365).optional(),
});

router.post('/', requireAuth, requireFeature('api_access'), async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = CreateApiKeySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
            return;
        }
        
        const { name, permissions, expiresInDays } = parsed.data;
        const { prefix, secret } = generateApiKey();
        const keyHash = hashKey(secret);
        
        const expiresAt = expiresInDays 
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : null;
        
        const result = await query(`
            INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [req.user!.userId, name, keyHash, prefix, permissions, expiresAt]);
        
        const apiKey: ApiKeyWithSecret = {
            id: result.rows[0].id,
            name,
            keyPrefix: prefix,
            permissions,
            isActive: true,
            lastUsedAt: null,
            expiresAt,
            createdAt: new Date(),
            secret: `${prefix}_${secret.substring(10)}`, // Return full key
        };
        
        await logAuditEvent({
            userId: req.user!.userId,
            action: AuditActions.API_KEY_CREATED,
            resourceType: 'api_key',
            resourceId: apiKey.id,
            changes: { name, permissions, expiresInDays },
            ...getClientInfo(req),
        });

        res.status(201).json({
            message: 'API key created successfully',
            key: apiKey,
        });
    } catch (error) {
        console.error('[API Keys] Create error:', error);
        res.status(500).json({ error: 'Failed to create API key' });
    }
});

// ============================================================================
// DELETE /api-keys/:id — Revoke API key
// ============================================================================

router.delete('/:id', requireAuth, requireFeature('api_access'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        
        const result = await query(`
            UPDATE api_keys
            SET is_active = FALSE
            WHERE id = $1 AND user_id = $2
            RETURNING id
        `, [id, req.user!.userId]);
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'API key not found' });
            return;
        }
        
        await logAuditEvent({
            userId: req.user!.userId,
            action: AuditActions.API_KEY_REVOKED,
            resourceType: 'api_key',
            resourceId: id,
            ...getClientInfo(req),
        });

        res.json({ message: 'API key revoked successfully' });
    } catch (error) {
        console.error('[API Keys] Delete error:', error);
        res.status(500).json({ error: 'Failed to revoke API key' });
    }
});

// ============================================================================
// PATCH /api-keys/:id — Update API key
// ============================================================================

const UpdateApiKeySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(z.enum(['read', 'write', 'admin'])).optional(),
});

router.patch('/:id', requireAuth, requireFeature('api_access'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        const parsed = UpdateApiKeySchema.safeParse(req.body);
        
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
            return;
        }
        
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;
        
        if (parsed.data.name) {
            updates.push(`name = $${paramIndex++}`);
            values.push(parsed.data.name);
        }
        
        if (parsed.data.permissions) {
            updates.push(`permissions = $${paramIndex++}`);
            values.push(parsed.data.permissions);
        }
        
        if (updates.length === 0) {
            res.status(400).json({ error: 'No updates provided' });
            return;
        }
        
        values.push(id, req.user!.userId);
        
        const result = await query(`
            UPDATE api_keys
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
            RETURNING id, name, key_prefix, permissions, is_active
        `, values);
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'API key not found' });
            return;
        }
        
        res.json({ key: result.rows[0] });
    } catch (error) {
        console.error('[API Keys] Update error:', error);
        res.status(500).json({ error: 'Failed to update API key' });
    }
});

// ============================================================================
// GET /api-keys/:id/regenerate — Regenerate API key
// ============================================================================

router.post('/:id/regenerate', requireAuth, requireFeature('api_access'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        
        // Verify ownership
        const existing = await query(`
            SELECT id FROM api_keys
            WHERE id = $1 AND user_id = $2 AND is_active = TRUE
        `, [id, req.user!.userId]);
        
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'API key not found' });
            return;
        }
        
        // Generate new key
        const { prefix, secret } = generateApiKey();
        const keyHash = hashKey(secret);
        
        await query(`
            UPDATE api_keys
            SET key_hash = $1, key_prefix = $2, created_at = NOW()
            WHERE id = $3
        `, [keyHash, prefix, id]);
        
        await logAuditEvent({
            userId: req.user!.userId,
            action: AuditActions.API_KEY_REGENERATED,
            resourceType: 'api_key',
            resourceId: id,
            ...getClientInfo(req),
        });

        res.json({
            message: 'API key regenerated successfully',
            key: {
                id,
                keyPrefix: prefix,
                secret: `${prefix}_${secret.substring(10)}`,
            },
        });
    } catch (error) {
        console.error('[API Keys] Regenerate error:', error);
        res.status(500).json({ error: 'Failed to regenerate API key' });
    }
});

// ============================================================================
// GET /api-keys/usage — Get API key usage stats
// ============================================================================

router.get('/usage', requireAuth, requireFeature('api_access'), async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(`
            SELECT 
                ak.id,
                ak.name,
                ak.key_prefix,
                ak.is_active,
                ak.last_used_at,
                COUNT(al.id) as call_count,
                SUM(al.input_tokens) as total_input_tokens,
                SUM(al.output_tokens) as total_output_tokens,
                MAX(al.created_at) as last_call
            FROM api_keys ak
            LEFT JOIN llm_call_logs al ON al.operation LIKE '%api_key%'
            WHERE ak.user_id = $1
            GROUP BY ak.id, ak.name, ak.key_prefix, ak.is_active, ak.last_used_at
            ORDER BY ak.created_at DESC
        `, [req.user!.userId]);
        
        res.json({ usage: result.rows });
    } catch (error) {
        console.error('[API Keys] Usage error:', error);
        res.status(500).json({ error: 'Failed to get API key usage' });
    }
});

export default router;
