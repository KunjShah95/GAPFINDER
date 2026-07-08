import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
    query: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
    requireAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

import express, { Router, Request, Response } from 'express';
import http from 'http';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import impactRouter from '../routes/impact.js';

const mockQuery = query as ReturnType<typeof vi.fn>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res as Response;
}

async function callRoute(
    method: string,
    path: string,
    body?: any,
): Promise<{ status: number; body: any }> {
    return new Promise((resolve) => {
        const app = express();
        app.use(express.json());
        app.use('/api/impact', impactRouter);

        const server = app.listen(0, () => {
            const addr = server.address() as any;
            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port: addr.port,
                    path,
                    method,
                    headers: { 'content-type': 'application/json' },
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        server.close();
                        resolve({
                            status: res.statusCode!,
                            body: data ? JSON.parse(data) : null,
                        });
                    });
                },
            );
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Impact Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // =========================================================================
    // GET /api/impact/trends
    // =========================================================================

    describe('GET /trends', () => {
        it('returns trending topics grouped by venue', async () => {
            const mockRows = [
                { topic: 'NeurIPS', count: 150, growth: 12.5 },
                { topic: 'ICML', count: 120, growth: 10.2 },
            ];
            (mockQuery as any).mockResolvedValue({ rows: mockRows, rowCount: 2 });

            const res = await callRoute('GET', '/api/impact/trends');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ trends: mockRows });
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        it('returns empty array when no papers exist', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            const res = await callRoute('GET', '/api/impact/trends');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ trends: [] });
        });

        it('returns 500 when database query fails', async () => {
            (mockQuery as any).mockRejectedValue(new Error('connection refused'));

            const res = await callRoute('GET', '/api/impact/trends');

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to fetch trends' });
        });

        it('limits results to 10', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/trends');

            expect(mockQuery.mock.calls[0][0]).toContain('LIMIT 10');
        });

        it('filters out null and empty venue values', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/trends');

            const sql = mockQuery.mock.calls[0][0];
            expect(sql).toContain('venue IS NOT NULL');
            expect(sql).toContain("venue != ''");
        });

        it('returns growth as percentage of total papers', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/trends');

            const sql = mockQuery.mock.calls[0][0];
            expect(sql).toContain('COUNT(*)::float / (SELECT COUNT(*) FROM papers) * 100');
        });

        it('casts count to integer', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/trends');

            expect(mockQuery.mock.calls[0][0]).toContain('COUNT(*)::int');
        });

        it('groups by venue', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/trends');

            expect(mockQuery.mock.calls[0][0]).toContain('GROUP BY venue');
        });

        it('orders by count descending', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/trends');

            expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY COUNT(*) DESC');
        });

        it('queries the papers table', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/trends');

            expect(mockQuery.mock.calls[0][0]).toContain('FROM papers');
        });
    });

    // =========================================================================
    // GET /api/impact/signals
    // =========================================================================

    describe('GET /signals', () => {
        it('returns research signals grouped by type', async () => {
            const mockRows = [
                { signal: 'gap', count: 80, confidence: 0.85 },
                { signal: 'trend', count: 60, confidence: 0.72 },
            ];
            (mockQuery as any).mockResolvedValue({ rows: mockRows, rowCount: 2 });

            const res = await callRoute('GET', '/api/impact/signals');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ signals: mockRows });
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        it('returns empty array when no gaps exist', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            const res = await callRoute('GET', '/api/impact/signals');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ signals: [] });
        });

        it('returns 500 when database query fails', async () => {
            (mockQuery as any).mockRejectedValue(new Error('timeout'));

            const res = await callRoute('GET', '/api/impact/signals');

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to fetch signals' });
        });

        it('orders signals by count descending', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/signals');

            expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY COUNT(*) DESC');
        });

        it('computes average confidence', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/signals');

            expect(mockQuery.mock.calls[0][0]).toContain('AVG(confidence)::float');
        });

        it('casts signal count to integer', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/signals');

            expect(mockQuery.mock.calls[0][0]).toContain('COUNT(*)::int');
        });

        it('queries the gaps table', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/signals');

            expect(mockQuery.mock.calls[0][0]).toContain('FROM gaps');
        });

        it('groups by type', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/signals');

            expect(mockQuery.mock.calls[0][0]).toContain('GROUP BY type');
        });

        it('aliases type as signal', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [], rowCount: 0 });

            await callRoute('GET', '/api/impact/signals');

            expect(mockQuery.mock.calls[0][0]).toContain('type as signal');
        });
    });

    // =========================================================================
    // Router structure
    // =========================================================================

    describe('router structure', () => {
        it('exports a valid Express Router', () => {
            expect(impactRouter).toBeDefined();
            expect(typeof impactRouter).toBe('function');
        });

        it('has exactly 2 route layers (GET /trends and GET /signals)', () => {
            const stack = (impactRouter as any).stack;
            const routeLayers = stack.filter((l: any) => l.route);
            expect(routeLayers).toHaveLength(2);
        });

        it('only exposes GET methods (no POST/PUT/DELETE)', () => {
            const stack = (impactRouter as any).stack;
            const routeLayers = stack.filter((l: any) => l.route);
            for (const layer of routeLayers) {
                const methods = Object.keys(layer.route.methods);
                expect(methods).toEqual(['get']);
            }
        });

        it('has requireAuth middleware on both routes', () => {
            const stack = (impactRouter as any).stack;
            const routeLayers = stack.filter((l: any) => l.route);
            for (const layer of routeLayers) {
                const handles = layer.route.stack;
                const authMiddleware = handles.find(
                    (h: any) => h.handle === requireAuth || h.name === 'requireAuth'
                );
                expect(authMiddleware).toBeDefined();
            }
        });
    });

    // =========================================================================
    // requireAuth middleware behavior
    // =========================================================================

    describe('requireAuth middleware', () => {
        it('rejects requests without Authorization header', async () => {
            // Create a fresh app WITHOUT the mock override to test real middleware
            vi.resetModules();
            vi.doMock('../middleware/auth.js', async (importOriginal) => {
                const actual = await importOriginal<typeof import('../middleware/auth.js')>();
                return actual; // use real implementation
            });
            vi.doMock('../db/client.js', () => ({
                query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            }));

            const { default: realRouter } = await import('../routes/impact.js');

            const app = express();
            app.use('/api/impact', realRouter);

            const res = await new Promise<{ status: number; body: any }>((resolve) => {
                const server = app.listen(0, () => {
                    const addr = server.address() as any;
                    http.get(
                        { hostname: '127.0.0.1', port: addr.port, path: '/api/impact/trends' },
                        (res) => {
                            let data = '';
                            res.on('data', (chunk) => (data += chunk));
                            res.on('end', () => {
                                server.close();
                                resolve({ status: res.statusCode!, body: JSON.parse(data) });
                            });
                        },
                    );
                });
            });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Authentication required');

            vi.restoreAllMocks();
        });
    });
});
