// ============================================================================
// Audit Trail — SOC 2 Compliance Logging
// Immutable audit log for all security-relevant actions
// ============================================================================

import { type Request } from 'express';
import { query } from '../db/client.js';

// ============================================================================
// Types
// ============================================================================

export interface AuditEvent {
    userId?: string | null;
    action: string;
    resourceType?: string | null;
    resourceId?: string | null;
    changes?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
}

export interface AuditLogEntry {
    id: string;
    userId: string | null;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    changes: Record<string, any>;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
}

export interface AuditLogFilters {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}

export interface AuditStats {
    totalEvents: number;
    eventsByAction: Record<string, number>;
    eventsByResource: Record<string, number>;
    recentFailures: number;
    uniqueUsers: number;
}

// ============================================================================
// Audit Action Constants (26+ types for SOC 2)
// ============================================================================

export const AuditActions = {
    // Auth
    USER_LOGIN: 'user.login',
    USER_LOGOUT: 'user.logout',
    USER_REGISTER: 'user.register',
    USER_PASSWORD_CHANGED: 'user.password_changed',
    USER_LOGIN_FAILED: 'user.login_failed',
    USER_PROFILE_UPDATED: 'user.profile_updated',

    // Data — Papers
    PAPER_CREATED: 'paper.created',
    PAPER_DELETED: 'paper.deleted',
    PAPER_UPDATED: 'paper.updated',

    // Data — Gaps
    GAP_CREATED: 'gap.created',
    GAP_DELETED: 'gap.deleted',
    GAP_UPDATED: 'gap.updated',
    GAP_RESOLVED: 'gap.resolved',
    GAP_VOTED: 'gap.voted',

    // Access — API Keys
    API_KEY_CREATED: 'api_key.created',
    API_KEY_REVOKED: 'api_key.revoked',
    API_KEY_USED: 'api_key.used',
    API_KEY_REGENERATED: 'api_key.regenerated',

    // Admin — Teams
    TEAM_MEMBER_INVITED: 'team.member_invited',
    TEAM_MEMBER_REMOVED: 'team.member_removed',
    TEAM_ROLE_CHANGED: 'team.role_changed',

    // Billing
    SUBSCRIPTION_CREATED: 'subscription.created',
    SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
    SUBSCRIPTION_UPDATED: 'subscription.updated',
    PAYMENT_FAILED: 'payment.failed',
    PAYMENT_SUCCEEDED: 'payment.succeeded',

    // Security
    DLP_FILTER_APPLIED: 'dlp_filter.applied',
    SETTINGS_CHANGED: 'settings.changed',
    EXPORT_REQUESTED: 'export.requested',
    DATA_EXPORTED: 'data.exported',

    // System
    BATCH_JOB_STARTED: 'batch_job.started',
    BATCH_JOB_COMPLETED: 'batch_job.completed',
    BATCH_JOB_FAILED: 'batch_job.failed',

    // Webhook
    WEBHOOK_RECEIVED: 'webhook.received',
    WEBHOOK_FAILED: 'webhook.failed',
} as const;

export type AuditActionType = (typeof AuditActions)[keyof typeof AuditActions];

// ============================================================================
// Core Logging Function
// ============================================================================

/**
 * Insert an audit event into the audit_logs table.
 * Failures are logged but never thrown — audit logging must not break the request.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
    try {
        await query(
            `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                event.userId || null,
                event.action,
                event.resourceType || null,
                event.resourceId || null,
                JSON.stringify(event.changes || {}),
                event.ipAddress || null,
                event.userAgent || null,
            ]
        );
    } catch (error) {
        // Audit failures must never break the request flow
        console.error('[Audit] Failed to log event:', event.action, error);
    }
}

// ============================================================================
// Express Middleware
// ============================================================================

/**
 * Extract client info (IP, user-agent) from an Express request.
 */
export function getClientInfo(req: Request): { ipAddress: string; userAgent: string } {
    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
        || req.socket.remoteAddress
        || 'unknown';

    const uaHeader = req.headers['user-agent'];
    const userAgent = (typeof uaHeader === 'string' ? uaHeader : 'unknown');

    return { ipAddress, userAgent };
}

/**
 * Express middleware that auto-logs an audit event after the response finishes.
 * Attaches `req.user` info if present (from requireAuth middleware).
 *
 * Usage: router.post('/login', auditMiddleware(AuditActions.USER_LOGIN), handler)
 */
export function auditMiddleware(action: string) {
    return (req: Request, _res: any, next: () => void): void => {
        // Store the action and capture time; log on response finish
        const { ipAddress, userAgent } = getClientInfo(req);
        const userId = req.user?.userId || null;

        // Hook into response finish to log after processing
        const originalFinish = _res.finish;
        _res.finish = function () {
            // Restore original
            _res.finish = originalFinish;

            // Log the audit event
            logAuditEvent({
                userId,
                action,
                resourceType: extractResourceType(req),
                resourceId: extractResourceId(req),
                changes: extractChanges(req),
                ipAddress,
                userAgent,
            }).catch(() => {}); // Fire-and-forget

            // Call original finish
            return originalFinish.apply(this, arguments as any);
        };

        next();
    };
}

// ============================================================================
// Helper: Direct Audit Logging for Specific Operations
// ============================================================================

/**
 * Log a login failure (no userId since auth failed).
 */
export async function logLoginFailure(req: Request, email: string, reason: string): Promise<void> {
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAuditEvent({
        action: AuditActions.USER_LOGIN_FAILED,
        changes: { email, reason },
        ipAddress,
        userAgent,
    });
}

/**
 * Log a successful login.
 */
export async function logLoginSuccess(req: Request, userId: string): Promise<void> {
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAuditEvent({
        userId,
        action: AuditActions.USER_LOGIN,
        ipAddress,
        userAgent,
    });
}

/**
 * Log a user registration.
 */
export async function logRegistration(req: Request, userId: string, email: string): Promise<void> {
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAuditEvent({
        userId,
        action: AuditActions.USER_REGISTER,
        changes: { email },
        ipAddress,
        userAgent,
    });
}

/**
 * Log password change.
 */
export async function logPasswordChange(req: Request, userId: string): Promise<void> {
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAuditEvent({
        userId,
        action: AuditActions.USER_PASSWORD_CHANGED,
        ipAddress,
        userAgent,
    });
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Query audit logs with flexible filters.
 */
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<{
    logs: AuditLogEntry[];
    total: number;
}> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
    }
    if (filters.action) {
        conditions.push(`action = $${paramIndex++}`);
        params.push(filters.action);
    }
    if (filters.resourceType) {
        conditions.push(`resource_type = $${paramIndex++}`);
        params.push(filters.resourceType);
    }
    if (filters.resourceId) {
        conditions.push(`resource_id = $${paramIndex++}`);
        params.push(filters.resourceId);
    }
    if (filters.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.startDate);
    }
    if (filters.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const countResult = await query(
        `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
        params
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await query(
        `SELECT id, user_id, action, resource_type, resource_id, changes, ip_address, user_agent, created_at
         FROM audit_logs ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        [...params, limit, offset]
    );

    return {
        logs: result.rows.map((row) => ({
            id: row.id,
            userId: row.user_id,
            action: row.action,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            changes: row.changes,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            createdAt: row.created_at,
        })),
        total,
    };
}

/**
 * Get aggregate audit stats for a user (or all users).
 */
export async function getAuditStats(userId?: string): Promise<AuditStats> {
    const userClause = userId ? 'WHERE user_id = $1' : '';
    const params = userId ? [userId] : [];

    const [totalResult, actionResult, resourceResult, failureResult, uniqueResult] = await Promise.all([
        query(`SELECT COUNT(*) as total FROM audit_logs ${userClause}`, params),
        query(
            `SELECT action, COUNT(*) as count FROM audit_logs ${userClause} GROUP BY action ORDER BY count DESC`,
            params
        ),
        query(
            `SELECT resource_type, COUNT(*) as count FROM audit_logs ${userClause} AND resource_type IS NOT NULL GROUP BY resource_type ORDER BY count DESC`,
            params
        ),
        query(
            `SELECT COUNT(*) as count FROM audit_logs ${userClause ? `${userClause} AND` : 'WHERE'} action LIKE '%failed'`,
            params
        ),
        query(
            `SELECT COUNT(DISTINCT user_id) as count FROM audit_logs ${userClause}`,
            params
        ),
    ]);

    const eventsByAction: Record<string, number> = {};
    for (const row of actionResult.rows) {
        eventsByAction[row.action] = parseInt(row.count);
    }

    const eventsByResource: Record<string, number> = {};
    for (const row of resourceResult.rows) {
        eventsByResource[row.resource_type] = parseInt(row.count);
    }

    return {
        totalEvents: parseInt(totalResult.rows[0].total),
        eventsByAction,
        eventsByResource,
        recentFailures: parseInt(failureResult.rows[0].count),
        uniqueUsers: parseInt(uniqueResult.rows[0].count),
    };
}

/**
 * Get recent activity (last N events across all users).
 */
export async function getRecentActivity(limit: number = 20): Promise<AuditLogEntry[]> {
    const result = await query(
        `SELECT al.id, al.user_id, al.action, al.resource_type, al.resource_id,
                al.changes, al.ip_address, al.user_agent, al.created_at,
                u.email as user_email, u.name as user_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         ORDER BY al.created_at DESC
         LIMIT $1`,
        [limit]
    );

    return result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        changes: { ...row.changes, userEmail: row.user_email, userName: row.user_name },
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdAt: row.created_at,
    }));
}

// ============================================================================
// Internal Helpers
// ============================================================================

function extractResourceType(req: Request): string | null {
    // Attempt to infer from URL path
    const match = req.path.match(/^\/?(\w+)/);
    return match ? match[1] : null;
}

function extractResourceId(req: Request): string | null {
    // Check params for :id
    const id = req.params?.id;
    if (id) return Array.isArray(id) ? id[0] : id;
    // Check body for common ID fields
    const body = req.body as Record<string, any> || {};
    if (body.paperId) return body.paperId;
    if (body.gapId) return body.gapId;
    return null;
}

function extractChanges(req: Request): Record<string, any> | undefined {
    if (!req.body || Object.keys(req.body).length === 0) return undefined;
    // Sanitize: strip sensitive fields
    const sanitized = { ...req.body };
    delete sanitized.password;
    delete sanitized.currentPassword;
    delete sanitized.newPassword;
    delete sanitized.token;
    delete sanitized.refreshToken;
    return sanitized;
}
