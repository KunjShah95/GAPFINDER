// ============================================================================
// Auth Routes
// Registration, login, refresh, profile
// ============================================================================

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { config } from '../config.js';
import { requireAuth, generateTokens, type JwtPayload } from '../middleware/auth.js';
import { logAuditEvent, logLoginFailure, logLoginSuccess, logRegistration, logPasswordChange, AuditActions } from '../lib/audit-trail.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const RegisterSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required').max(100),
});

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const UpdateProfileSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    avatar: z.string().url().optional(),
});

const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// ============================================================================
// POST /auth/register
// ============================================================================

router.post('/register', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = RegisterSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { email, password, name } = parsed.data;

        // Check if user exists
        const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            res.status(409).json({ error: 'Email already registered' });
            return;
        }

        // Hash password and create user
        const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

        const result = await transaction(async (client) => {
            // Create user
            const userResult = await client.query(
                `INSERT INTO users (email, password_hash, name)
                 VALUES ($1, $2, $3)
                 RETURNING id, email, name, role, created_at`,
                [email.toLowerCase(), passwordHash, name]
            );

            const user = userResult.rows[0];

            // Create free subscription
            await client.query(
                `INSERT INTO subscriptions (user_id, tier, status)
                 VALUES ($1, 'free', 'active')`,
                [user.id]
            );

            // Create initial usage record
            await client.query(
                `INSERT INTO usage_records (user_id, period_start, period_end)
                 VALUES ($1, date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')`,
                [user.id]
            );

            // Create XP record
            await client.query(
                `INSERT INTO user_xp (user_id) VALUES ($1)`,
                [user.id]
            );

            return user;
        });

        const tokenPayload: JwtPayload = {
            userId: result.id,
            email: result.email,
            role: result.role,
            tier: 'free',
        };

        const tokens = generateTokens(tokenPayload);

        await logRegistration(req, result.id, email);

        res.status(201).json({
            user: {
                id: result.id,
                email: result.email,
                name: result.name,
                role: result.role,
                tier: 'free',
                createdAt: result.created_at,
            },
            ...tokens,
        });
    } catch (error) {
        console.error('[Auth] Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================================================
// POST /auth/login
// ============================================================================

router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = LoginSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { email, password } = parsed.data;

        // Fetch user with subscription
        const result = await query(
            `SELECT u.id, u.email, u.name, u.password_hash, u.role, u.avatar,
                    COALESCE(s.tier, 'free') as tier
             FROM users u
             LEFT JOIN subscriptions s ON s.user_id = u.id
             WHERE u.email = $1`,
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            await logLoginFailure(req, email, 'user_not_found');
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        const user = result.rows[0];

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            await logLoginFailure(req, email, 'invalid_password');
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        // Update last login
        await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

        const tokenPayload: JwtPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            tier: user.tier,
        };

        const tokens = generateTokens(tokenPayload);

        await logLoginSuccess(req, user.id);

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                tier: user.tier,
                avatar: user.avatar,
            },
            ...tokens,
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ============================================================================
// POST /auth/refresh
// ============================================================================

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            res.status(400).json({ error: 'Refresh token required' });
            return;
        }

        // Verify refresh token
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(refreshToken, config.jwtSecret) as { userId: string; type: string };

        if (decoded.type !== 'refresh') {
            res.status(401).json({ error: 'Invalid token type' });
            return;
        }

        // Fetch fresh user data
        const result = await query(
            `SELECT u.id, u.email, u.name, u.role,
                    COALESCE(s.tier, 'free') as tier
             FROM users u
             LEFT JOIN subscriptions s ON s.user_id = u.id
             WHERE u.id = $1`,
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            res.status(401).json({ error: 'User not found' });
            return;
        }

        const user = result.rows[0];

        const tokenPayload: JwtPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            tier: user.tier,
        };

        const tokens = generateTokens(tokenPayload);

        res.json({ ...tokens });
    } catch (error) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// ============================================================================
// GET /auth/me
// ============================================================================

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT u.id, u.email, u.name, u.role, u.avatar, u.is_verified, u.created_at,
                    COALESCE(s.tier, 'free') as tier,
                    s.status as subscription_status,
                    s.current_period_end,
                    x.total_xp, x.level, x.current_streak, x.papers_analyzed, x.gaps_found
             FROM users u
             LEFT JOIN subscriptions s ON s.user_id = u.id
             LEFT JOIN user_xp x ON x.user_id = u.id
             WHERE u.id = $1`,
            [req.user!.userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const user = result.rows[0];
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            avatar: user.avatar,
            isVerified: user.is_verified,
            tier: user.tier,
            subscriptionStatus: user.subscription_status,
            currentPeriodEnd: user.current_period_end,
            xp: {
                totalXp: user.total_xp || 0,
                level: user.level || 1,
                currentStreak: user.current_streak || 0,
                papersAnalyzed: user.papers_analyzed || 0,
                gapsFound: user.gaps_found || 0,
            },
            createdAt: user.created_at,
        });
    } catch (error) {
        console.error('[Auth] Me error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// ============================================================================
// PATCH /auth/profile
// ============================================================================

router.patch('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = UpdateProfileSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (parsed.data.name) {
            updates.push(`name = $${paramIndex++}`);
            values.push(parsed.data.name);
        }
        if (parsed.data.avatar) {
            updates.push(`avatar = $${paramIndex++}`);
            values.push(parsed.data.avatar);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        values.push(req.user!.userId);

        await query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        res.json({ message: 'Profile updated' });
    } catch (error) {
        console.error('[Auth] Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ============================================================================
// POST /auth/change-password
// ============================================================================

router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = ChangePasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { currentPassword, newPassword } = parsed.data;

        const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!isMatch) {
            res.status(400).json({ error: 'Current password is incorrect' });
            return;
        }

        const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user!.userId]);

        await logPasswordChange(req, req.user!.userId);

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('[Auth] Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

export default router;
