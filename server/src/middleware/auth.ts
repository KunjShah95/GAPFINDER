// ============================================================================
// Authentication Middleware
// JWT verification, role-based access, and rate limiting per user
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/client.js';

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
 * Usage quota enforcement middleware
 */
export function checkQuota(resource: 'papers' | 'api_calls') {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        try {
            const tier = req.user.tier as keyof typeof config.limits;
            const limits = config.limits[tier] || config.limits.free;

            // Enterprise has unlimited (-1)
            if (resource === 'papers' && limits.papersPerMonth === -1) {
                next();
                return;
            }

            // Check current usage
            const result = await query(
                `SELECT papers_processed, api_calls FROM usage_records 
                 WHERE user_id = $1 AND period_start <= NOW() AND period_end >= NOW()
                 ORDER BY period_start DESC LIMIT 1`,
                [req.user.userId]
            );

            if (result.rows.length > 0) {
                const usage = result.rows[0];

                if (resource === 'papers' && usage.papers_processed >= limits.papersPerMonth) {
                    res.status(429).json({
                        error: 'Monthly paper limit reached',
                        code: 'QUOTA_EXCEEDED',
                        limit: limits.papersPerMonth,
                        used: usage.papers_processed,
                    });
                    return;
                }

                if (resource === 'api_calls' && usage.api_calls >= limits.apiCallsPerDay) {
                    res.status(429).json({
                        error: 'Daily API call limit reached',
                        code: 'QUOTA_EXCEEDED',
                        limit: limits.apiCallsPerDay,
                        used: usage.api_calls,
                    });
                    return;
                }
            }

            next();
        } catch (error) {
            console.error('[Quota] Check failed:', error);
            // Don't block on quota check failure
            next();
        }
    };
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
