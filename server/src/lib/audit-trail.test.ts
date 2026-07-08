// ============================================================================
// Audit Trail Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    AuditActions,
    getClientInfo,
    type AuditEvent,
} from './audit-trail.js';

// Mock the database client
vi.mock('../db/client.js', () => ({
    query: vi.fn(),
}));

import { query } from '../db/client.js';

const mockQuery = vi.mocked(query);

describe('Audit Trail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ========================================================================
    // AuditActions Constants
    // ========================================================================

    describe('AuditActions', () => {
        it('has 26+ action types', () => {
            const actionCount = Object.keys(AuditActions).length;
            expect(actionCount).toBeGreaterThanOrEqual(26);
        });

        it('includes all auth actions', () => {
            expect(AuditActions.USER_LOGIN).toBe('user.login');
            expect(AuditActions.USER_LOGOUT).toBe('user.logout');
            expect(AuditActions.USER_REGISTER).toBe('user.register');
            expect(AuditActions.USER_PASSWORD_CHANGED).toBe('user.password_changed');
            expect(AuditActions.USER_LOGIN_FAILED).toBe('user.login_failed');
        });

        it('includes all data actions', () => {
            expect(AuditActions.PAPER_CREATED).toBe('paper.created');
            expect(AuditActions.PAPER_DELETED).toBe('paper.deleted');
            expect(AuditActions.GAP_CREATED).toBe('gap.created');
            expect(AuditActions.GAP_DELETED).toBe('gap.deleted');
            expect(AuditActions.GAP_UPDATED).toBe('gap.updated');
        });

        it('includes all access actions', () => {
            expect(AuditActions.API_KEY_CREATED).toBe('api_key.created');
            expect(AuditActions.API_KEY_REVOKED).toBe('api_key.revoked');
            expect(AuditActions.API_KEY_USED).toBe('api_key.used');
        });

        it('includes all admin actions', () => {
            expect(AuditActions.TEAM_MEMBER_INVITED).toBe('team.member_invited');
            expect(AuditActions.TEAM_MEMBER_REMOVED).toBe('team.member_removed');
            expect(AuditActions.TEAM_ROLE_CHANGED).toBe('team.role_changed');
        });

        it('includes all billing actions', () => {
            expect(AuditActions.SUBSCRIPTION_CREATED).toBe('subscription.created');
            expect(AuditActions.SUBSCRIPTION_CANCELLED).toBe('subscription.cancelled');
            expect(AuditActions.PAYMENT_FAILED).toBe('payment.failed');
        });

        it('includes all security actions', () => {
            expect(AuditActions.DLP_FILTER_APPLIED).toBe('dlp_filter.applied');
            expect(AuditActions.SETTINGS_CHANGED).toBe('settings.changed');
            expect(AuditActions.EXPORT_REQUESTED).toBe('export.requested');
        });

        it('includes all system actions', () => {
            expect(AuditActions.BATCH_JOB_STARTED).toBe('batch_job.started');
            expect(AuditActions.BATCH_JOB_COMPLETED).toBe('batch_job.completed');
            expect(AuditActions.BATCH_JOB_FAILED).toBe('batch_job.failed');
        });

        it('all action strings follow dot notation', () => {
            for (const value of Object.values(AuditActions)) {
                expect(value).toMatch(/^[a-z_]+\.[a-z_]+$/);
            }
        });
    });

    // ========================================================================
    // getClientInfo
    // ========================================================================

    describe('getClientInfo', () => {
        it('extracts IP from x-forwarded-for header', () => {
            const req = {
                headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'user-agent': 'TestBot/1.0' },
                socket: { remoteAddress: '127.0.0.1' },
            } as any;

            const info = getClientInfo(req);
            expect(info.ipAddress).toBe('1.2.3.4');
            expect(info.userAgent).toBe('TestBot/1.0');
        });

        it('falls back to socket.remoteAddress', () => {
            const req = {
                headers: {},
                socket: { remoteAddress: '192.168.1.1' },
            } as any;

            const info = getClientInfo(req);
            expect(info.ipAddress).toBe('192.168.1.1');
        });

        it('returns "unknown" when no IP available', () => {
            const req = {
                headers: {},
                socket: {},
            } as any;

            const info = getClientInfo(req);
            expect(info.ipAddress).toBe('unknown');
            expect(info.userAgent).toBe('unknown');
        });

        it('handles IPv6 loopback', () => {
            const req = {
                headers: {},
                socket: { remoteAddress: '::1' },
            } as any;

            const info = getClientInfo(req);
            expect(info.ipAddress).toBe('::1');
        });
    });

    // ========================================================================
    // logAuditEvent (unit-level with mocked DB)
    // ========================================================================

    describe('logAuditEvent', () => {
        it('inserts audit event into database', async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

            const { logAuditEvent } = await import('./audit-trail.js');

            await logAuditEvent({
                userId: 'user-123',
                action: AuditActions.USER_LOGIN,
                ipAddress: '1.2.3.4',
                userAgent: 'Mozilla/5.0',
            });

            expect(mockQuery).toHaveBeenCalledTimes(1);
            const [sql, params] = mockQuery.mock.calls[0];
            expect(sql).toContain('INSERT INTO audit_logs');
            expect(params).toContain('user-123');
            expect(params).toContain('user.login');
            expect(params).toContain('1.2.3.4');
            expect(params).toContain('Mozilla/5.0');
        });

        it('handles null userId', async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

            const { logAuditEvent } = await import('./audit-trail.js');

            await logAuditEvent({
                action: AuditActions.USER_LOGIN_FAILED,
                changes: { email: 'test@example.com', reason: 'bad password' },
            });

            const [, params] = mockQuery.mock.calls[0]!;
            expect(params![0]).toBeNull();
        });

        it('serializes changes as JSON', async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

            const { logAuditEvent } = await import('./audit-trail.js');

            await logAuditEvent({
                action: AuditActions.SETTINGS_CHANGED,
                changes: { theme: 'dark', notifications: false },
            });

            const [, params] = mockQuery.mock.calls[0]!;
            const changes = JSON.parse(params![4]);
            expect(changes.theme).toBe('dark');
            expect(changes.notifications).toBe(false);
        });

        it('does not throw on database failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB connection lost'));

            const { logAuditEvent } = await import('./audit-trail.js');

            // Should not throw
            await expect(
                logAuditEvent({ action: AuditActions.USER_LOGIN })
            ).resolves.toBeUndefined();
        });
    });

    // ========================================================================
    // AuditActions Uniqueness
    // ========================================================================

    describe('action uniqueness', () => {
        it('all action values are unique', () => {
            const values = Object.values(AuditActions);
            const unique = new Set(values);
            expect(unique.size).toBe(values.length);
        });
    });
});
