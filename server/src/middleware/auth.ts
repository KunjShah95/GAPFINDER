// ============================================================================
// Authentication Middleware
// JWT verification, role-based access, feature gating, and rate limiting
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/client.js';
import {
    type Tier,
    type Feature,
    tierHasFeature,
    requiredTierForFeature,
    checkQuota as checkFeatureQuota,
    type TierQuota,
} from '../lib/feature-gates.js';

export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
    tier: string;
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

/**
 * Require authentication — rejects with 401 if no valid token
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
        req.user = decoded;
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        } else {
            res.status(401).json({ error: 'Invalid token' });
        }
    }
}

/**
 * Optional auth — attaches user if token present, continues either way
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
            req.user = decoded;
        } catch {
            // Token invalid but we don't block — just no user attached
        }
    }

    next();
}

/**
 * Require specific roles
 */
export function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }

        next();
    };
}

/**
 * Require admin role — rejects with 403 if user is not admin
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}

/**
 * Check subscription tier for feature gating
 */
export function requireTier(...tiers: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!tiers.includes(req.user.tier)) {
            res.status(403).json({
                error: 'Feature not available on your plan',
                code: 'UPGRADE_REQUIRED',
                requiredTier: tiers[0],
            });
            return;
        }

        next();
    };
}

/**
 * Require a specific feature — checks if user's tier includes the feature.
 * More granular than requireTier: maps features to minimum tier automatically.
 */
export function requireFeature(feature: Feature) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        const userTier = (req.user.tier || 'free') as Tier;

        if (!tierHasFeature(userTier, feature)) {
            const needed = requiredTierForFeature(feature);
            res.status(403).json({
                error: 'Feature not available on your plan',
                code: 'UPGRADE_REQUIRED',
                feature,
                requiredTier: needed,
                currentTier: userTier,
            });
            return;
        }

        next();
    };
}

/**
 * Usage quota enforcement middleware — checks per-tier usage limits.
 * resource maps to a TierQuota key.
 */
export function checkUsageLimit(resource: keyof TierQuota) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        try {
            const userTier = (req.user.tier || 'free') as Tier;

            // Enterprise has unlimited on most resources
            if (userTier === 'enterprise') {
                next();
                return;
            }

            // Get current usage from the database
            const result = await query(
                `SELECT papers_processed, gaps_extracted, api_calls, export_count
                 FROM usage_records
                 WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()
                 ORDER BY period_start DESC LIMIT 1`,
                [req.user.userId]
            );

            let currentUsage = 0;
            if (result.rows.length > 0) {
                const usage = result.rows[0];
                switch (resource) {
                    case 'papersPerMonth':
                        currentUsage = usage.papers_processed || 0;
                        break;
                    case 'gapExtractionsPerMonth':
                        currentUsage = usage.gaps_extracted || 0;
                        break;
                    case 'apiCallsPerDay':
                        currentUsage = usage.api_calls || 0;
                        break;
                    case 'exportsPerMonth':
                        currentUsage = usage.export_count || 0;
                        break;
                    default:
                        currentUsage = 0;
                }
            }

            const quota = checkFeatureQuota(userTier, resource, currentUsage);

            if (!quota.allowed) {
                res.status(429).json({
                    error: `Monthly ${String(resource)} limit reached`,
                    code: 'QUOTA_EXCEEDED',
                    resource,
                    limit: quota.limit,
                    used: currentUsage,
                    remaining: quota.remaining,
                    tier: userTier,
                });
                return;
            }

            // Attach quota info to request for downstream use
            (req as any).quotaInfo = quota;
            next();
        } catch (error) {
            console.error('[UsageLimit] Check failed:', error);
            // Don't block on quota check failure — fail open
            next();
        }
    };
}

/**
 * Legacy checkQuota — maps old resource names to new checkUsageLimit.
 * Preserved for backward compatibility with existing routes.
 */
export function checkQuota(resource: 'papers' | 'api_calls') {
    const mappedResource = resource === 'papers' ? 'papersPerMonth' : 'apiCallsPerDay';
    return checkUsageLimit(mappedResource as keyof TierQuota);
}

/**
 * Generate JWT token pair
 */
export function generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(
        { userId: payload.userId, type: 'refresh' },
        config.jwtSecret,
        { expiresIn: config.refreshTokenExpiresIn } as jwt.SignOptions
    );

    return { accessToken, refreshToken };
}
