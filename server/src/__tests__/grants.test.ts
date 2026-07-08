import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import express from 'express';

// Mock db client BEFORE importing the route
vi.mock('../db/client.js', () => ({
    query: vi.fn(),
}));

// Mock auth middleware — bypass JWT verification in tests
vi.mock('../middleware/auth.js', () => ({
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
        req.user = (req as any).__testUser ?? { userId: 'user-1', email: 'u@test.com', role: 'user', tier: 'free' };
        next();
    },
    requireAdmin: (req: Request, res: Response, next: NextFunction) => {
        if (req.user?.role !== 'admin') {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        next();
    },
}));

import { query } from '../db/client.js';
import grantsRouter from '../routes/grants.js';

const mockQuery = vi.mocked(query);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(testUser?: any) {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        if (testUser) (req as any).__testUser = testUser;
        next();
    });
    app.use('/api/grants', grantsRouter);
    return app;
}

function ok(rows: any[]) {
    return { rows, rowCount: rows.length } as any;
}

const uuid = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Grants Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ====================== GET /stats ======================

    describe('GET /api/grants/stats', () => {
        it('returns stats overview for authenticated user', async () => {
            mockQuery
                .mockResolvedValueOnce(ok([{ count: '12' }]))               // open opportunities
                .mockResolvedValueOnce(ok([{ status: 'draft', count: '3' }, { status: 'submitted', count: '1' }])) // proposals
                .mockResolvedValueOnce(ok([{ id: uuid, name: 'Grant A', agency: 'NIH', deadline: '2026-12-01', domain: 'bio' }])); // deadlines

            const res = await request(makeApp()).get('/api/grants/stats');

            expect(res.status).toBe(200);
            expect(res.body.openOpportunities).toBe(12);
            expect(res.body.proposalsByStatus.draft).toBe(3);
            expect(res.body.proposalsByStatus.submitted).toBe(1);
            expect(res.body.upcomingDeadlines).toHaveLength(1);
        });

        it('returns 500 on db error', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db down'));

            const res = await request(makeApp()).get('/api/grants/stats');

            expect(res.status).toBe(500);
            expect(res.body.error).toMatch(/Failed to fetch grant stats/);
        });
    });

    // ====================== GET /opportunities ======================

    describe('GET /api/grants/opportunities', () => {
        it('returns paginated opportunities with defaults', async () => {
            const rows = [{ id: uuid, name: 'G1' }];
            mockQuery
                .mockResolvedValueOnce(ok(rows))
                .mockResolvedValueOnce(ok([{ total: '1' }]));

            const res = await request(makeApp()).get('/api/grants/opportunities');

            expect(res.status).toBe(200);
            expect(res.body.opportunities).toHaveLength(1);
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.limit).toBe(20);
            expect(res.body.pagination.total).toBe(1);
        });

        it('applies domain filter', async () => {
            mockQuery
                .mockResolvedValueOnce(ok([]))
                .mockResolvedValueOnce(ok([{ total: '0' }]));

            await request(makeApp()).get('/api/grants/opportunities?domain=AI');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('domain = $1');
        });

        it('applies agency ILIKE filter', async () => {
            mockQuery
                .mockResolvedValueOnce(ok([]))
                .mockResolvedValueOnce(ok([{ total: '0' }]));

            await request(makeApp()).get('/api/grants/opportunities?agency=NIH');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('agency ILIKE');
        });

        it('applies status filter', async () => {
            mockQuery
                .mockResolvedValueOnce(ok([]))
                .mockResolvedValueOnce(ok([{ total: '0' }]));

            await request(makeApp()).get('/api/grants/opportunities?status=open');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('status = $');
        });

        it('returns 500 on db error', async () => {
            mockQuery.mockRejectedValueOnce(new Error('boom'));

            const res = await request(makeApp()).get('/api/grants/opportunities');

            expect(res.status).toBe(500);
        });
    });

    // ====================== POST /opportunities ======================

    describe('POST /api/grants/opportunities', () => {
        it('creates opportunity as admin', async () => {
            const admin = { userId: 'a1', email: 'admin@test.com', role: 'admin', tier: 'enterprise' };
            const body = { name: 'New Grant', agency: 'NSF', domain: 'cs', status: 'open' };
            mockQuery.mockResolvedValueOnce(ok([{ id: uuid, ...body }]));

            const res = await request(makeApp(admin))
                .post('/api/grants/opportunities')
                .send(body);

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('New Grant');
        });

        it('rejects non-admin with 403', async () => {
            const res = await request(makeApp())
                .post('/api/grants/opportunities')
                .send({ name: 'X' });

            expect(res.status).toBe(403);
        });

        it('returns 400 on validation failure (missing name)', async () => {
            const admin = { userId: 'a1', email: 'admin@test.com', role: 'admin', tier: 'enterprise' };

            const res = await request(makeApp(admin))
                .post('/api/grants/opportunities')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Validation failed/);
        });

        it('returns 500 on db error', async () => {
            const admin = { userId: 'a1', email: 'admin@test.com', role: 'admin', tier: 'enterprise' };
            mockQuery.mockRejectedValueOnce(new Error('db'));

            const res = await request(makeApp(admin))
                .post('/api/grants/opportunities')
                .send({ name: 'G' });

            expect(res.status).toBe(500);
        });
    });

    // ====================== GET /opportunities/:id ======================

    describe('GET /api/grants/opportunities/:id', () => {
        it('returns the opportunity', async () => {
            mockQuery.mockResolvedValueOnce(ok([{ id: uuid, name: 'G1' }]));

            const res = await request(makeApp()).get(`/api/grants/opportunities/${uuid}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(uuid);
        });

        it('returns 404 when not found', async () => {
            mockQuery.mockResolvedValueOnce(ok([]));

            const res = await request(makeApp()).get(`/api/grants/opportunities/${uuid}`);

            expect(res.status).toBe(404);
        });
    });

    // ====================== PATCH /opportunities/:id ======================

    describe('PATCH /api/grants/opportunities/:id', () => {
        it('updates opportunity fields as admin', async () => {
            const admin = { userId: 'a1', email: 'admin@test.com', role: 'admin', tier: 'enterprise' };
            mockQuery.mockResolvedValueOnce(ok([{ id: uuid, name: 'Updated' }]));

            const res = await request(makeApp(admin))
                .patch(`/api/grants/opportunities/${uuid}`)
                .send({ name: 'Updated' });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Updated');
        });

        it('rejects non-admin with 403', async () => {
            const res = await request(makeApp())
                .patch(`/api/grants/opportunities/${uuid}`)
                .send({ name: 'X' });

            expect(res.status).toBe(403);
        });

        it('returns 400 when no fields provided', async () => {
            const admin = { userId: 'a1', email: 'admin@test.com', role: 'admin', tier: 'enterprise' };

            const res = await request(makeApp(admin))
                .patch(`/api/grants/opportunities/${uuid}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('returns 404 when opportunity does not exist', async () => {
            const admin = { userId: 'a1', email: 'admin@test.com', role: 'admin', tier: 'enterprise' };
            mockQuery.mockResolvedValueOnce(ok([]));

            const res = await request(makeApp(admin))
                .patch(`/api/grants/opportunities/${uuid}`)
                .send({ name: 'X' });

            expect(res.status).toBe(404);
        });
    });

    // ====================== DELETE /opportunities/:id ======================

    describe('DELETE /api/grants/opportunities/:id', () => {
        it('deletes opportunity as admin', async () => {
            const admin = { userId: 'a1', email: 'admin@test.com', role: 'admin', tier: 'enterprise' };
            mockQuery.mockResolvedValueOnce(ok([{ id: uuid }]));

            const res = await request(makeApp(admin)).delete(`/api/grants/opportunities/${uuid}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/deleted/i);
        });

        it('rejects non-admin with 403', async () => {
            const res = await request(makeApp()).delete(`/api/grants/opportunities/${uuid}`);

            expect(res.status).toBe(403);
        });

        it('returns 404 when not found', async () => {
            const admin = { userId: 'a1', email: 'admin@test.com', role: 'admin', tier: 'enterprise' };
            mockQuery.mockResolvedValueOnce(ok([]));

            const res = await request(makeApp(admin)).delete(`/api/grants/opportunities/${uuid}`);

            expect(res.status).toBe(404);
        });
    });

    // ====================== GET /proposals ======================

    describe('GET /api/grants/proposals', () => {
        it('returns user proposals with pagination', async () => {
            mockQuery
                .mockResolvedValueOnce(ok([{ id: uuid, title: 'P1', opportunity_name: 'G1' }]))
                .mockResolvedValueOnce(ok([{ total: '1' }]));

            const res = await request(makeApp()).get('/api/grants/proposals');

            expect(res.status).toBe(200);
            expect(res.body.proposals).toHaveLength(1);
            expect(res.body.pagination.total).toBe(1);
        });

        it('applies status filter', async () => {
            mockQuery
                .mockResolvedValueOnce(ok([]))
                .mockResolvedValueOnce(ok([{ total: '0' }]));

            await request(makeApp()).get('/api/grants/proposals?status=draft');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('p.status = $');
        });

        it('returns 500 on db error', async () => {
            mockQuery.mockRejectedValueOnce(new Error('fail'));

            const res = await request(makeApp()).get('/api/grants/proposals');

            expect(res.status).toBe(500);
        });
    });

    // ====================== POST /proposals ======================

    describe('POST /api/grants/proposals', () => {
        it('creates a proposal', async () => {
            mockQuery.mockResolvedValueOnce(ok([{ id: uuid, title: 'My Proposal', user_id: 'user-1' }]));

            const res = await request(makeApp())
                .post('/api/grants/proposals')
                .send({ title: 'My Proposal' });

            expect(res.status).toBe(201);
            expect(res.body.title).toBe('My Proposal');
        });

        it('returns 400 on validation failure (missing title)', async () => {
            const res = await request(makeApp())
                .post('/api/grants/proposals')
                .send({});

            expect(res.status).toBe(400);
        });

        it('returns 500 on db error', async () => {
            mockQuery.mockRejectedValueOnce(new Error('db'));

            const res = await request(makeApp())
                .post('/api/grants/proposals')
                .send({ title: 'P' });

            expect(res.status).toBe(500);
        });
    });

    // ====================== GET /proposals/:id ======================

    describe('GET /api/grants/proposals/:id', () => {
        it('returns the proposal with opportunity details', async () => {
            mockQuery.mockResolvedValueOnce(ok([{ id: uuid, title: 'P1', opportunity_name: 'G1' }]));

            const res = await request(makeApp()).get(`/api/grants/proposals/${uuid}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(uuid);
            expect(res.body.opportunity_name).toBe('G1');
        });

        it('returns 404 when not found', async () => {
            mockQuery.mockResolvedValueOnce(ok([]));

            const res = await request(makeApp()).get(`/api/grants/proposals/${uuid}`);

            expect(res.status).toBe(404);
        });
    });

    // ====================== PATCH /proposals/:id ======================

    describe('PATCH /api/grants/proposals/:id', () => {
        it('updates proposal fields', async () => {
            mockQuery.mockResolvedValueOnce(ok([{ id: uuid, title: 'Updated' }]));

            const res = await request(makeApp())
                .patch(`/api/grants/proposals/${uuid}`)
                .send({ title: 'Updated' });

            expect(res.status).toBe(200);
            expect(res.body.title).toBe('Updated');
        });

        it('returns 400 when no fields provided', async () => {
            const res = await request(makeApp())
                .patch(`/api/grants/proposals/${uuid}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('returns 404 when proposal does not exist', async () => {
            mockQuery.mockResolvedValueOnce(ok([]));

            const res = await request(makeApp())
                .patch(`/api/grants/proposals/${uuid}`)
                .send({ title: 'X' });

            expect(res.status).toBe(404);
        });
    });

    // ====================== DELETE /proposals/:id ======================

    describe('DELETE /api/grants/proposals/:id', () => {
        it('deletes proposal', async () => {
            mockQuery.mockResolvedValueOnce(ok([{ id: uuid }]));

            const res = await request(makeApp()).delete(`/api/grants/proposals/${uuid}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/deleted/i);
        });

        it('returns 404 when not found', async () => {
            mockQuery.mockResolvedValueOnce(ok([]));

            const res = await request(makeApp()).delete(`/api/grants/proposals/${uuid}`);

            expect(res.status).toBe(404);
        });
    });
});
