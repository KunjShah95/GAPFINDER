// ============================================================================
// Feature Gates API
// Exposes feature gate definitions and user-specific feature access to frontend
// ============================================================================

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';
import {
    type Tier,
    type Feature,
    tierHasFeature,
    featuresForTier,
    featuresLockedForTier,
    TIER_QUOTAS,
    TIER_METADATA,
    FEATURE_METADATA,
} from '../lib/feature-gates.js';

const router = Router();

// ============================================================================
// GET /feature-gates — Get all features and current user's access
// ============================================================================

router.get('/', requireAuth, (req: Request, res: Response): void => {
    const userTier = (req.user!.tier || 'free') as Tier;

    const available = featuresForTier(userTier);
    const locked = featuresLockedForTier(userTier);

    res.json({
        tier: userTier,
        available,
        locked: locked.map(({ feature, requiredTier }) => ({
            feature,
            requiredTier,
            ...FEATURE_METADATA[feature],
        })),
        quotas: TIER_QUOTAS[userTier],
        tiers: Object.entries(TIER_METADATA).map(([key, meta]) => ({
            ...meta,
            isCurrent: key === userTier,
            isUpgrade: ['free', 'pro', 'team', 'enterprise'].indexOf(key) > ['free', 'pro', 'team', 'enterprise'].indexOf(userTier),
        })),
    });
});

// ============================================================================
// GET /feature-gates/check/:feature — Check if current user has a feature
// ============================================================================

router.get('/check/:feature', requireAuth, (req: Request, res: Response): void => {
    const userTier = (req.user!.tier || 'free') as Tier;
    const feature = req.params.feature as Feature;

    const hasAccess = tierHasFeature(userTier, feature);
    const meta = FEATURE_METADATA[feature];

    if (!meta) {
        res.status(404).json({ error: 'Unknown feature', feature });
        return;
    }

    res.json({
        feature,
        hasAccess,
        requiredTier: meta.tier,
        currentTier: userTier,
        ...meta,
    });
});

// ============================================================================
// GET /feature-gates/quotas — Get current usage and quotas
// ============================================================================

router.get('/quotas', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userTier = (req.user!.tier || 'free') as Tier;
        const quotas = TIER_QUOTAS[userTier] || TIER_QUOTAS.free;

        const usageResult = await query(
            `SELECT resource_type, SUM(quantity) as total_used
             FROM usage_records
             WHERE user_id = $1
               AND period_start >= date_trunc('month', CURRENT_DATE)
             GROUP BY resource_type`,
            [req.user!.userId]
        );

        const usageMap: Record<string, number> = {};
        for (const row of usageResult.rows) {
            usageMap[row.resource_type] = parseInt(row.total_used);
        }

        const result = {
            tier: userTier,
            quotas: {
                papersPerMonth: {
                    limit: quotas.papersPerMonth,
                    used: usageMap['papers'] || 0,
                    remaining: quotas.papersPerMonth === -1 ? -1 : Math.max(0, quotas.papersPerMonth - (usageMap['papers'] || 0)),
                },
                gapExtractionsPerMonth: {
                    limit: quotas.gapExtractionsPerMonth,
                    used: usageMap['gaps'] || 0,
                    remaining: quotas.gapExtractionsPerMonth === -1 ? -1 : Math.max(0, quotas.gapExtractionsPerMonth - (usageMap['gaps'] || 0)),
                },
                apiCallsPerDay: {
                    limit: quotas.apiCallsPerDay,
                    used: usageMap['api_calls'] || 0,
                    remaining: quotas.apiCallsPerDay === -1 ? -1 : Math.max(0, quotas.apiCallsPerDay - (usageMap['api_calls'] || 0)),
                },
            },
        };

        res.json(result);
    } catch (error) {
        const userTier = (req.user!.tier || 'free') as Tier;
        const quotas = TIER_QUOTAS[userTier] || TIER_QUOTAS.free;
        res.json({ tier: userTier, quotas });
    }
});

export default router;
