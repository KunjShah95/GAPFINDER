// ============================================================================
// Enterprise Settings API
// Organization settings, SSO, DLP filters, quotas
// ============================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

const defaultSettings = {
    allowPublicView: false,
    requireApproval: true,
    ssoEnabled: false,
    ssoProvider: undefined,
    quotas: {
        maxMembers: 10,
        maxStorage: 10737418240,
        maxApiCalls: 100000,
        maxCollections: 100,
        maxExports: 1000,
    },
    dlpEnabled: false,
    dlpFilters: [],
    allowedDomains: [] as string[],
    requireMfa: false,
    sessionTimeout: 3600,
    ipWhitelist: [] as string[],
    integrations: {
        defaultAiProvider: 'gemini',
        aiProviders: {
            geminiApiKey: '',
            openaiApiKey: '',
            anthropicApiKey: '',
            openrouterApiKey: '',
            deepseekApiKey: '',
            mistralApiKey: '',
            cohereApiKey: '',
        },
        searchProviders: {
            firecrawlApiKey: '',
            tavilyApiKey: '',
            serpapiApiKey: '',
            braveSearchApiKey: '',
            exaApiKey: '',
        },
    },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, override: unknown): T {
    if (Array.isArray(base)) {
        return (Array.isArray(override) ? override : base) as T;
    }

    if (!isPlainObject(base) || !isPlainObject(override)) {
        return (override === undefined ? base : override) as T;
    }

    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
        result[key] = mergeDeep((base as Record<string, unknown>)[key], value);
    }
    return result as T;
}

// ============================================================================
// GET /api/organizations/current — Get current user's organization
// ============================================================================

router.get('/current', requireAuth, requireFeature('sso'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        // Get user's organization
        const orgResult = await query(`
            SELECT o.*, om.role as member_role
            FROM organizations o
            JOIN organization_members om ON om.organization_id = o.id
            WHERE om.user_id = $1 AND om.status = 'active'
            ORDER BY o.created_at DESC
            LIMIT 1
        `, [userId]);

        if (orgResult.rows.length === 0) {
            res.json({ organization: null, settings: null });
            return;
        }

        const org = orgResult.rows[0];

        // Get settings
        const settings = mergeDeep(defaultSettings, org.settings || {});

        res.json({ organization: org, settings });
    } catch (error) {
        console.error('[Enterprise] Get error:', error);
        res.status(500).json({ error: 'Failed to get organization' });
    }
});

// ============================================================================
// PATCH /api/organizations/current/settings — Update organization settings
// ============================================================================

router.patch('/current/settings', requireAuth, requireFeature('sso'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const updates = req.body;

        // Get user's organization
        const orgResult = await query(`
            SELECT o.id, om.role
            FROM organizations o
            JOIN organization_members om ON om.organization_id = o.id
            WHERE om.user_id = $1 AND om.status = 'active' AND om.role IN ('owner', 'admin')
            ORDER BY o.created_at DESC
            LIMIT 1
        `, [userId]);

        if (orgResult.rows.length === 0) {
            res.status(403).json({ error: 'Not authorized to modify settings' });
            return;
        }

        const orgId = orgResult.rows[0].id;

        const currentResult = await query(
            `SELECT settings FROM organizations WHERE id = $1`,
            [orgId]
        );

        const currentSettings = currentResult.rows[0]?.settings || {};
        const mergedSettings = mergeDeep(defaultSettings, currentSettings);
        const nextSettings = mergeDeep(mergedSettings, updates);

        await query(
            `UPDATE organizations
             SET settings = $1::jsonb,
                 updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(nextSettings), orgId]
        );

        res.json({ message: 'Settings updated', settings: nextSettings });
    } catch (error) {
        console.error('[Enterprise] Update error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ============================================================================
// GET /api/organizations/current/dlp-filters — Get DLP filters
// ============================================================================

router.get('/current/dlp-filters', requireAuth, requireFeature('dlp_filters'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        // Get user's organization
        const orgResult = await query(`
            SELECT o.id
            FROM organizations o
            JOIN organization_members om ON om.organization_id = o.id
            WHERE om.user_id = $1 AND om.status = 'active'
            LIMIT 1
        `, [userId]);

        if (orgResult.rows.length === 0) {
            res.json({ filters: [] });
            return;
        }

        const filtersResult = await query(`
            SELECT * FROM dlp_filters
            WHERE organization_id = $1
            ORDER BY created_at DESC
        `, [orgResult.rows[0].id]);

        res.json({ filters: filtersResult.rows });
    } catch (error) {
        console.error('[DLP] List error:', error);
        res.status(500).json({ error: 'Failed to get DLP filters' });
    }
});

// ============================================================================
// POST /api/organizations/current/dlp-filters — Add DLP filter
// ============================================================================

router.post('/current/dlp-filters', requireAuth, requireFeature('dlp_filters'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const { name, type, pattern, action, severity, enabled } = req.body;

        // Get user's organization
        const orgResult = await query(`
            SELECT o.id, om.role
            FROM organizations o
            JOIN organization_members om ON om.organization_id = o.id
            WHERE om.user_id = $1 AND om.status = 'active' AND om.role IN ('owner', 'admin')
            LIMIT 1
        `, [userId]);

        if (orgResult.rows.length === 0) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }

        const result = await query(`
            INSERT INTO dlp_filters (organization_id, name, type, pattern, action, severity, enabled)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [orgResult.rows[0].id, name, type, pattern, action, severity, enabled ?? true]);

        res.status(201).json({ filter: result.rows[0] });
    } catch (error) {
        console.error('[DLP] Create error:', error);
        res.status(500).json({ error: 'Failed to add DLP filter' });
    }
});

// ============================================================================
// DELETE /api/organizations/current/dlp-filters/:id — Delete DLP filter
// ============================================================================

router.delete('/current/dlp-filters/:id', requireAuth, requireFeature('dlp_filters'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;

        // Get user's organization
        const orgResult = await query(`
            SELECT o.id, om.role
            FROM organizations o
            JOIN organization_members om ON om.organization_id = o.id
            WHERE om.user_id = $1 AND om.status = 'active' AND om.role IN ('owner', 'admin')
            LIMIT 1
        `, [userId]);

        if (orgResult.rows.length === 0) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }

        await query(`
            DELETE FROM dlp_filters
            WHERE id = $1 AND organization_id = $2
        `, [id, orgResult.rows[0].id]);

        res.json({ message: 'Filter deleted' });
    } catch (error) {
        console.error('[DLP] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete DLP filter' });
    }
});

export default router;
