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
import { OAuth2Client } from 'google-auth-library';

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

const GoogleOAuthSchema = z.object({
    credential: z.string().min(1, 'Google credential is required'),
});

const ForgotPasswordSchema = z.object({
    email: z.string().email('Invalid email'),
});

const ResetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
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

// ============================================================================
// POST /auth/google — Google OAuth login/register
// ============================================================================

router.post('/google', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = GoogleOAuthSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { credential } = parsed.data;

        // Verify the Google ID token
        const googleClient = new OAuth2Client(config.googleClientId);
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: config.googleClientId,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            res.status(400).json({ error: 'Invalid Google token' });
            return;
        }

        const { email, name, picture, sub: googleId } = payload;

        // Check if user exists
        const existing = await query(
            `SELECT id, email, name, role, avatar, is_verified,
                    COALESCE((SELECT tier FROM subscriptions WHERE user_id = users.id LIMIT 1), 'free') as tier
             FROM users WHERE email = $1`,
            [email.toLowerCase()]
        );

        let user;
        let isNewUser = false;

        if (existing.rows.length > 0) {
            // User exists — update Google ID and avatar if needed
            user = existing.rows[0];
            await query(
                `UPDATE users SET google_id = $1, avatar = COALESCE($2, avatar), is_verified = TRUE WHERE id = $3`,
                [googleId, picture, user.id]
            );
        } else {
            // Create new user
            isNewUser = true;
            const result = await transaction(async (client) => {
                const userResult = await client.query(
                    `INSERT INTO users (email, name, avatar, google_id, is_verified, password_hash)
                     VALUES ($1, $2, $3, $4, TRUE, '')
                     RETURNING id, email, name, role, avatar, is_verified`,
                    [email.toLowerCase(), name || email.split('@')[0], picture, googleId]
                );

                const newUser = userResult.rows[0];

                // Create free subscription
                await client.query(
                    `INSERT INTO subscriptions (user_id, tier, status)
                     VALUES ($1, 'free', 'active')`,
                    [newUser.id]
                );

                // Create initial usage record
                await client.query(
                    `INSERT INTO usage_records (user_id, period_start, period_end)
                     VALUES ($1, date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')`,
                    [newUser.id]
                );

                // Create XP record
                await client.query(
                    `INSERT INTO user_xp (user_id) VALUES ($1)`,
                    [newUser.id]
                );

                return newUser;
            });

            user = result;
            await logRegistration(req, user.id, email);
        }

        // Fetch fresh user data with tier
        const freshUser = await query(
            `SELECT u.id, u.email, u.name, u.role, u.avatar, u.is_verified,
                    COALESCE(s.tier, 'free') as tier
             FROM users u
             LEFT JOIN subscriptions s ON s.user_id = u.id
             WHERE u.id = $1`,
            [user.id]
        );

        const userData = freshUser.rows[0];

        const tokenPayload: JwtPayload = {
            userId: userData.id,
            email: userData.email,
            role: userData.role,
            tier: userData.tier,
        };

        const tokens = generateTokens(tokenPayload);

        // Store session
        await query(
            `INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
             VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')`,
            [userData.id, await bcrypt.hash(tokens.refreshToken, 10), req.headers['user-agent'] || '', req.ip || '', ]
        );

        await logLoginSuccess(req, userData.id);

        res.json({
            user: {
                id: userData.id,
                email: userData.email,
                name: userData.name,
                role: userData.role,
                tier: userData.tier,
                avatar: userData.avatar,
                isVerified: userData.is_verified,
            },
            isNewUser,
            ...tokens,
        });
    } catch (error) {
        console.error('[Auth] Google OAuth error:', error);
        res.status(500).json({ error: 'Google authentication failed' });
    }
});

// ============================================================================
// POST /auth/forgot-password — Send password reset email
// ============================================================================

router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = ForgotPasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { email } = parsed.data;

        // Always return success to prevent email enumeration
        const user = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);

        if (user.rows.length > 0) {
            const userId = user.rows[0].id;

            // Generate reset token (1 hour expiry)
            const resetToken = require('crypto').randomBytes(32).toString('hex');
            const resetTokenHash = await bcrypt.hash(resetToken, 10);

            // Store hashed token in sessions table with special marker
            await query(
                `INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
                 VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
                [userId, `reset:${resetTokenHash}`]
            );

            // In production, send email here via SendGrid/SES
            // For now, log the token (dev only)
            if (config.isDev) {
                console.log(`[Auth] Password reset token for ${email}: ${resetToken}`);
            }
        }

        // Always return success
        res.json({ message: 'If an account exists with that email, a reset link has been sent' });
    } catch (error) {
        console.error('[Auth] Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// ============================================================================
// POST /auth/reset-password — Reset password with token
// ============================================================================

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = ResetPasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
            return;
        }

        const { token, newPassword } = parsed.data;

        // Find valid reset session
        const sessions = await query(
            `SELECT id, user_id FROM sessions
             WHERE refresh_token_hash LIKE 'reset:%'
               AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 10`,
            []
        );

        let matchedUserId: string | null = null;
        let matchedSessionId: string | null = null;

        for (const session of sessions.rows) {
            const storedHash = session.refresh_token_hash.replace('reset:', '');
            const isValid = await bcrypt.compare(token, storedHash);
            if (isValid) {
                matchedUserId = session.user_id;
                matchedSessionId = session.id;
                break;
            }
        }

        if (!matchedUserId || !matchedSessionId) {
            res.status(400).json({ error: 'Invalid or expired reset token' });
            return;
        }

        // Update password
        const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, matchedUserId]);

        // Delete all reset sessions for this user
        await query(
            `DELETE FROM sessions WHERE user_id = $1 AND refresh_token_hash LIKE 'reset:%'`,
            [matchedUserId]
        );

        // Also delete all active sessions (force re-login)
        await query('DELETE FROM sessions WHERE user_id = $1', [matchedUserId]);

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('[Auth] Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// ============================================================================
// POST /auth/verify-email — Verify email with token
// ============================================================================

router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ error: 'Verification token required' });
            return;
        }

        // Find verification session
        const sessions = await query(
            `SELECT id, user_id FROM sessions
             WHERE refresh_token_hash LIKE 'verify:%'
               AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 10`,
            []
        );

        let matchedUserId: string | null = null;

        for (const session of sessions.rows) {
            const storedHash = session.refresh_token_hash.replace('verify:', '');
            const isValid = await bcrypt.compare(token, storedHash);
            if (isValid) {
                matchedUserId = session.user_id;
                break;
            }
        }

        if (!matchedUserId) {
            res.status(400).json({ error: 'Invalid or expired verification token' });
            return;
        }

        // Mark email as verified
        await query('UPDATE users SET is_verified = TRUE WHERE id = $1', [matchedUserId]);

        // Clean up verification sessions
        await query(
            `DELETE FROM sessions WHERE user_id = $1 AND refresh_token_hash LIKE 'verify:%'`,
            [matchedUserId]
        );

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        console.error('[Auth] Verify email error:', error);
        res.status(500).json({ error: 'Failed to verify email' });
    }
});

// ============================================================================
// POST /auth/send-verification — Send verification email
// ============================================================================

router.post('/send-verification', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;

        // Check if already verified
        const user = await query('SELECT is_verified, email FROM users WHERE id = $1', [userId]);
        if (user.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (user.rows[0].is_verified) {
            res.json({ message: 'Email already verified' });
            return;
        }

        // Generate verification token
        const verifyToken = require('crypto').randomBytes(32).toString('hex');
        const verifyTokenHash = await bcrypt.hash(verifyToken, 10);

        // Store in sessions
        await query(
            `INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
            [userId, `verify:${verifyTokenHash}`]
        );

        // In production, send email here
        if (config.isDev) {
            console.log(`[Auth] Email verification token for ${user.rows[0].email}: ${verifyToken}`);
        }

        res.json({ message: 'Verification email sent' });
    } catch (error) {
        console.error('[Auth] Send verification error:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

// ============================================================================
// POST /auth/logout — Invalidate session
// ============================================================================

router.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { refreshToken } = req.body;
        const userId = req.user!.userId;

        if (refreshToken) {
            // Delete specific session
            const sessions = await query(
                `SELECT id, refresh_token_hash FROM sessions WHERE user_id = $1 ORDER BY created_at DESC`,
                [userId]
            );

            for (const session of sessions.rows) {
                const isMatch = await bcrypt.compare(refreshToken, session.refresh_token_hash);
                if (isMatch) {
                    await query('DELETE FROM sessions WHERE id = $1', [session.id]);
                    break;
                }
            }
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('[Auth] Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
});

// ============================================================================
// POST /auth/logout-all — Invalidate all sessions
// ============================================================================

router.post('/logout-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        await query('DELETE FROM sessions WHERE user_id = $1', [req.user!.userId]);
        res.json({ message: 'All sessions invalidated' });
    } catch (error) {
        console.error('[Auth] Logout all error:', error);
        res.status(500).json({ error: 'Failed to logout all sessions' });
    }
});

// ============================================================================
// GET /auth/sessions — List active sessions
// ============================================================================

router.get('/sessions', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await query(
            `SELECT id, user_agent, ip_address, created_at, expires_at
             FROM sessions
             WHERE user_id = $1 AND refresh_token_hash NOT LIKE 'reset:%' AND refresh_token_hash NOT LIKE 'verify:%'
             ORDER BY created_at DESC`,
            [req.user!.userId]
        );

        res.json({ sessions: result.rows });
    } catch (error) {
        console.error('[Auth] Get sessions error:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

export default router;
