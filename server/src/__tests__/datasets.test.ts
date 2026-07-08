import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response } from 'express';

vi.mock('../db/client.js', () => ({
    query: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
    requireAuth: (req: Request, _res: Response, next: Function) => {
        req.user = { userId: 'user-1', email: 'test@example.com', role: 'user', tier: 'pro' };
        next();
    },
    requireFeature: () => (_req: Request, _res: Response, next: Function) => next(),
}));

import { query } from '../db/client.js';
import datasetsRouter from '../routes/datasets.js';
import supertest from 'supertest';

const mockQuery = vi.mocked(query);

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/datasets', datasetsRouter);
    return app;
}

describe('Datasets Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // =========================================================================
    // GET /api/datasets — List datasets
    // =========================================================================

    describe('GET /api/datasets', () => {
        it('returns list of datasets', async () => {
            const mockDatasets = [
                { id: '1', name: 'Dataset A', domain: 'AI', size: '100MB', format: 'CSV', citation_count: 5, created_at: '2025-01-01' },
            ];
            mockQuery.mockResolvedValue({ rows: mockDatasets } as any);

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(200);
            expect(res.body.datasets).toEqual(mockDatasets);
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to fetch datasets');
        });

        it('returns empty list when no datasets exist', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(200);
            expect(res.body.datasets).toEqual([]);
        });

        it('applies LIMIT 50 in query', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            await supertest(app)
                .get('/api/datasets')
                .set('Authorization', 'Bearer test-token');

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT 50')
            );
        });
    });

    // =========================================================================
    // POST /api/datasets — Create dataset
    // =========================================================================

    describe('POST /api/datasets', () => {
        it('creates a dataset and returns 201', async () => {
            const newDataset = { id: 'ds-1', title: 'New Dataset', domain: 'NLP', size: '50MB', format: 'JSON', citation_count: 0, created_at: '2025-06-01' };
            mockQuery.mockResolvedValue({ rows: [newDataset] } as any);

            const app = createApp();
            const res = await supertest(app)
                .post('/api/datasets')
                .set('Authorization', 'Bearer test-token')
                .send({ title: 'New Dataset', domain: 'NLP', size: '50MB', format: 'JSON' });

            expect(res.status).toBe(201);
            expect(res.body.dataset).toEqual(newDataset);
        });

        it('returns 400 on validation failure', async () => {
            const app = createApp();
            const res = await supertest(app)
                .post('/api/datasets')
                .set('Authorization', 'Bearer test-token')
                .send({ title: '' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .post('/api/datasets')
                .set('Authorization', 'Bearer test-token')
                .send({ title: 'Test Dataset', domain: 'ML' });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to create dataset');
        });
    });

    // =========================================================================
    // GET /api/datasets/stats — Dataset statistics
    // =========================================================================

    describe('GET /api/datasets/stats', () => {
        it('returns dataset statistics', async () => {
            const stats = { total: 42, domains: 5, total_benchmarks: 120 };
            mockQuery.mockResolvedValue({ rows: [stats] } as any);

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets/stats')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(200);
            expect(res.body.stats).toEqual(stats);
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets/stats')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(500);
            expect(res.body.error).toBeDefined();
        });
    });

    // =========================================================================
    // GET /api/datasets/:id — Dataset detail with benchmarks
    // =========================================================================

    describe('GET /api/datasets/:id', () => {
        it('returns dataset detail with benchmarks', async () => {
            const dataset = { id: 'ds-1', name: 'Dataset A', benchmarks: [{ id: 'b-1', name: 'Benchmark 1' }] };
            mockQuery.mockResolvedValue({ rows: [dataset] } as any);

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets/ds-1')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(200);
            expect(res.body.dataset).toEqual(dataset);
        });

        it('returns 404 when dataset not found', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets/nonexistent')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(404);
            expect(res.body.error).toBeDefined();
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets/ds-1')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(500);
            expect(res.body.error).toBeDefined();
        });
    });

    // =========================================================================
    // PATCH /api/datasets/:id — Update dataset
    // =========================================================================

    describe('PATCH /api/datasets/:id', () => {
        it('updates a dataset and returns it', async () => {
            const updated = { id: 'ds-1', name: 'Updated Dataset', domain: 'CV' };
            mockQuery.mockResolvedValue({ rows: [updated] } as any);

            const app = createApp();
            const res = await supertest(app)
                .patch('/api/datasets/ds-1')
                .set('Authorization', 'Bearer test-token')
                .send({ name: 'Updated Dataset', domain: 'CV' });

            expect(res.status).toBe(200);
            expect(res.body.dataset).toEqual(updated);
        });

        it('returns 404 when dataset not found', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            const res = await supertest(app)
                .patch('/api/datasets/nonexistent')
                .set('Authorization', 'Bearer test-token')
                .send({ name: 'Updated' });

            expect(res.status).toBe(404);
            expect(res.body.error).toBeDefined();
        });

        it('returns 400 when no fields provided', async () => {
            const app = createApp();
            const res = await supertest(app)
                .patch('/api/datasets/ds-1')
                .set('Authorization', 'Bearer test-token')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .patch('/api/datasets/ds-1')
                .set('Authorization', 'Bearer test-token')
                .send({ name: 'Updated' });

            expect(res.status).toBe(500);
            expect(res.body.error).toBeDefined();
        });
    });

    // =========================================================================
    // DELETE /api/datasets/:id — Delete dataset
    // =========================================================================

    describe('DELETE /api/datasets/:id', () => {
        it('deletes a dataset and returns success', async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: 'ds-1' }] } as any);

            const app = createApp();
            const res = await supertest(app)
                .delete('/api/datasets/ds-1')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(200);
            expect(res.body.message).toBeDefined();
        });

        it('returns 404 when dataset not found', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            const res = await supertest(app)
                .delete('/api/datasets/nonexistent')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(404);
            expect(res.body.error).toBeDefined();
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .delete('/api/datasets/ds-1')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(500);
            expect(res.body.error).toBeDefined();
        });
    });

    // =========================================================================
    // GET /api/datasets/:id/benchmarks — List benchmarks
    // =========================================================================

    describe('GET /api/datasets/:id/benchmarks', () => {
        it('returns list of benchmarks for a dataset', async () => {
            const benchmarks = [
                { id: 'b-1', name: 'Benchmark 1', dataset_id: 'ds-1' },
                { id: 'b-2', name: 'Benchmark 2', dataset_id: 'ds-1' },
            ];
            mockQuery.mockResolvedValue({ rows: benchmarks } as any);

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets/ds-1/benchmarks')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(200);
            expect(res.body.benchmarks).toEqual(benchmarks);
        });

        it('returns 404 when dataset not found', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets/nonexistent/benchmarks')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(404);
            expect(res.body.error).toBeDefined();
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .get('/api/datasets/ds-1/benchmarks')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(500);
            expect(res.body.error).toBeDefined();
        });
    });

    // =========================================================================
    // POST /api/datasets/:id/benchmarks — Create benchmark
    // =========================================================================

    describe('POST /api/datasets/:id/benchmarks', () => {
        it('creates a benchmark and returns 201', async () => {
            const newBenchmark = { id: 'b-1', name: 'New Benchmark', dataset_id: 'ds-1', metric: 'accuracy', score: 0.95 };
            mockQuery.mockResolvedValue({ rows: [newBenchmark] } as any);

            const app = createApp();
            const res = await supertest(app)
                .post('/api/datasets/ds-1/benchmarks')
                .set('Authorization', 'Bearer test-token')
                .send({ name: 'New Benchmark', metric: 'accuracy', score: 0.95 });

            expect(res.status).toBe(201);
            expect(res.body.benchmark).toEqual(newBenchmark);
        });

        it('returns 400 on validation failure', async () => {
            const app = createApp();
            const res = await supertest(app)
                .post('/api/datasets/ds-1/benchmarks')
                .set('Authorization', 'Bearer test-token')
                .send({ name: '' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it('returns 404 when dataset not found', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            const res = await supertest(app)
                .post('/api/datasets/nonexistent/benchmarks')
                .set('Authorization', 'Bearer test-token')
                .send({ name: 'New Benchmark', metric: 'accuracy', score: 0.95 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBeDefined();
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .post('/api/datasets/ds-1/benchmarks')
                .set('Authorization', 'Bearer test-token')
                .send({ name: 'New Benchmark', metric: 'accuracy', score: 0.95 });

            expect(res.status).toBe(500);
            expect(res.body.error).toBeDefined();
        });
    });

    // =========================================================================
    // PATCH /api/datasets/benchmarks/:id — Update benchmark
    // =========================================================================

    describe('PATCH /api/datasets/benchmarks/:id', () => {
        it('updates a benchmark', async () => {
            const updated = { id: 'b-1', name: 'Updated Benchmark', score: 0.98 };
            mockQuery.mockResolvedValue({ rows: [updated] } as any);

            const app = createApp();
            const res = await supertest(app)
                .patch('/api/datasets/benchmarks/b-1')
                .set('Authorization', 'Bearer test-token')
                .send({ score: 0.98 });

            expect(res.status).toBe(200);
            expect(res.body.benchmark).toEqual(updated);
        });

        it('returns 404 when benchmark not found', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            const res = await supertest(app)
                .patch('/api/datasets/benchmarks/nonexistent')
                .set('Authorization', 'Bearer test-token')
                .send({ score: 0.98 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBeDefined();
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .patch('/api/datasets/benchmarks/b-1')
                .set('Authorization', 'Bearer test-token')
                .send({ score: 0.98 });

            expect(res.status).toBe(500);
            expect(res.body.error).toBeDefined();
        });
    });

    // =========================================================================
    // DELETE /api/datasets/benchmarks/:id — Delete benchmark
    // =========================================================================

    describe('DELETE /api/datasets/benchmarks/:id', () => {
        it('deletes a benchmark', async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: 'b-1' }] } as any);

            const app = createApp();
            const res = await supertest(app)
                .delete('/api/datasets/benchmarks/b-1')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(200);
            expect(res.body.message).toBeDefined();
        });

        it('returns 404 when benchmark not found', async () => {
            mockQuery.mockResolvedValue({ rows: [] } as any);

            const app = createApp();
            const res = await supertest(app)
                .delete('/api/datasets/benchmarks/nonexistent')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(404);
            expect(res.body.error).toBeDefined();
        });

        it('returns 500 on query failure', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));

            const app = createApp();
            const res = await supertest(app)
                .delete('/api/datasets/benchmarks/b-1')
                .set('Authorization', 'Bearer test-token');

            expect(res.status).toBe(500);
            expect(res.body.error).toBeDefined();
        });
    });
});
