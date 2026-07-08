// ============================================================================
// Competitors Routes Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';

vi.mock('../middleware/auth.js', () => ({
    requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../db/client.js', () => ({
    query: vi.fn(),
}));

import { query } from '../db/client.js';
import competitorsRouter from '../routes/competitors.js';

const mockQuery = query as ReturnType<typeof vi.fn>;

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/competitors', competitorsRouter);
    return app;
}

describe('Competitors Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ========================================================================
    // GET /api/competitors/groups
    // ========================================================================

    describe('GET /api/competitors/groups', () => {
        it('returns groups from papers table', async () => {
            (mockQuery as any).mockResolvedValue({
                rows: [
                    { name: 'MIT CSAIL', type: 'Research Lab', papers: 42, h_index: 0, active: true },
                    { name: 'Stanford NLP', type: 'Research Lab', papers: 35, h_index: 0, active: true },
                ],
            });

            const res = await request(createApp()).get('/api/competitors/groups');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                groups: [
                    { name: 'MIT CSAIL', type: 'Research Lab', papers: 42, h_index: 0, active: true },
                    { name: 'Stanford NLP', type: 'Research Lab', papers: 35, h_index: 0, active: true },
                ],
            });
        });

        it('returns empty array when no groups found', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            const res = await request(createApp()).get('/api/competitors/groups');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ groups: [] });
        });

        it('returns 500 on database error', async () => {
            (mockQuery as any).mockRejectedValue(new Error('DB connection failed'));

            const res = await request(createApp()).get('/api/competitors/groups');

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to fetch groups' });
        });

        it('queries with correct SQL structure', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/groups');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('DISTINCT venue as name');
            expect(sql).toContain("'Research Lab' as type");
            expect(sql).toContain('COUNT(*)::int as papers');
            expect(sql).toContain('GROUP BY venue');
            expect(sql).toContain('ORDER BY COUNT(*) DESC');
            expect(sql).toContain('LIMIT 20');
        });

        it('filters out empty venues', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/groups');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('WHERE venue IS NOT NULL');
            expect(sql).toContain("venue != ''");
        });
    });

    // ========================================================================
    // GET /api/competitors/players
    // ========================================================================

    describe('GET /api/competitors/players', () => {
        it('returns players from papers table', async () => {
            (mockQuery as any).mockResolvedValue({
                rows: [
                    { name: 'Alice Smith', papers: 15, type: 'Researcher', active: true },
                    { name: 'Bob Jones', papers: 12, type: 'Researcher', active: true },
                ],
            });

            const res = await request(createApp()).get('/api/competitors/players');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                players: [
                    { name: 'Alice Smith', papers: 15, type: 'Researcher', active: true },
                    { name: 'Bob Jones', papers: 12, type: 'Researcher', active: true },
                ],
            });
        });

        it('returns empty array when no players found', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            const res = await request(createApp()).get('/api/competitors/players');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ players: [] });
        });

        it('returns 500 on database error', async () => {
            (mockQuery as any).mockRejectedValue(new Error('DB connection failed'));

            const res = await request(createApp()).get('/api/competitors/players');

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to fetch players' });
        });

        it('queries with correct SQL structure', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/players');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('unnest(authors) as name');
            expect(sql).toContain("'Researcher' as type");
            expect(sql).toContain('COUNT(*)::int as papers');
            expect(sql).toContain('GROUP BY unnest(authors)');
            expect(sql).toContain('ORDER BY COUNT(*) DESC');
            expect(sql).toContain('LIMIT 20');
        });

        it('filters out papers without authors', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/players');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('WHERE authors IS NOT NULL');
            expect(sql).toContain('array_length(authors, 1) > 0');
        });

        it('limits results to 20', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/players');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('LIMIT 20');
        });
    });

    // ========================================================================
    // Authentication (implicit via successful responses)
    // ========================================================================

    describe('authentication', () => {
        it('requireAuth mock allows requests through', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            const res = await request(createApp()).get('/api/competitors/groups');

            expect(res.status).toBe(200);
        });
    });

    // ========================================================================
    // Response shape
    // ========================================================================

    describe('response shape', () => {
        it('groups response contains "groups" key', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [{ name: 'A' }] });

            const res = await request(createApp()).get('/api/competitors/groups');

            expect(res.body).toHaveProperty('groups');
        });

        it('players response contains "players" key', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [{ name: 'A' }] });

            const res = await request(createApp()).get('/api/competitors/players');

            expect(res.body).toHaveProperty('players');
        });
    });

    // ========================================================================
    // Error handling
    // ========================================================================

    describe('error handling', () => {
        it('groups endpoint logs error to console', async () => {
            (mockQuery as any).mockRejectedValue(new Error('fail'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await request(createApp()).get('/api/competitors/groups');

            expect(consoleSpy).toHaveBeenCalledWith(
                '[Competitors] Groups error:',
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });

        it('players endpoint logs error to console', async () => {
            (mockQuery as any).mockRejectedValue(new Error('fail'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await request(createApp()).get('/api/competitors/players');

            expect(consoleSpy).toHaveBeenCalledWith(
                '[Competitors] Players error:',
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });
    });

    // ========================================================================
    // Data integrity
    // ========================================================================

    describe('data integrity', () => {
        it('returns data as-is from database for groups', async () => {
            const dbRow = {
                name: 'DeepMind',
                type: 'Research Lab',
                papers: 99,
                h_index: 0,
                active: true,
            };
            (mockQuery as any).mockResolvedValue({ rows: [dbRow] });

            const res = await request(createApp()).get('/api/competitors/groups');

            expect(res.body.groups).toEqual([dbRow]);
        });

        it('returns data as-is from database for players', async () => {
            const dbRow = {
                name: 'Geoffrey Hinton',
                papers: 50,
                type: 'Researcher',
                active: true,
            };
            (mockQuery as any).mockResolvedValue({ rows: [dbRow] });

            const res = await request(createApp()).get('/api/competitors/players');

            expect(res.body.players).toEqual([dbRow]);
        });

        it('handles multiple rows correctly', async () => {
            const rows = Array.from({ length: 20 }, (_, i) => ({
                name: `Group ${i}`,
                type: 'Research Lab',
                papers: 20 - i,
                h_index: 0,
                active: true,
            }));
            (mockQuery as any).mockResolvedValue({ rows });

            const res = await request(createApp()).get('/api/competitors/groups');

            expect(res.body.groups).toHaveLength(20);
            expect(res.body.groups[0]).toEqual(rows[0]);
            expect(res.body.groups[19]).toEqual(rows[19]);
        });
    });

    // ========================================================================
    // Query call count
    // ========================================================================

    describe('query call count', () => {
        it('calls query once for groups endpoint', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/groups');

            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        it('calls query once for players endpoint', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/players');

            expect(mockQuery).toHaveBeenCalledTimes(1);
        });
    });

    // ========================================================================
    // SQL parameter validation
    // ========================================================================

    describe('SQL parameter validation', () => {
        it('groups query takes no parameters', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/groups');

            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String)
            );
            expect(mockQuery.mock.calls[0]).toHaveLength(1);
        });

        it('players query takes no parameters', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/players');

            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String)
            );
            expect(mockQuery.mock.calls[0]).toHaveLength(1);
        });
    });

    // ========================================================================
    // Edge cases
    // ========================================================================

    describe('edge cases', () => {
        it('handles null rows from database gracefully', async () => {
            (mockQuery as any).mockResolvedValue({ rows: null });

            const res = await request(createApp()).get('/api/competitors/groups');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ groups: null });
        });

        it('handles very large result set', async () => {
            const rows = Array.from({ length: 100 }, (_, i) => ({
                name: `Author ${i}`,
                papers: 100 - i,
                type: 'Researcher',
                active: true,
            }));
            (mockQuery as any).mockResolvedValue({ rows });

            const res = await request(createApp()).get('/api/competitors/players');

            expect(res.status).toBe(200);
            expect(res.body.players).toHaveLength(100);
        });

        it('groups endpoint uses correct database table', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/groups');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('FROM papers');
            expect(sql).not.toContain('FROM commercial_players');
            expect(sql).not.toContain('FROM research_groups');
        });

        it('players endpoint uses correct database table', async () => {
            (mockQuery as any).mockResolvedValue({ rows: [] });

            await request(createApp()).get('/api/competitors/players');

            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain('FROM papers');
            expect(sql).not.toContain('FROM research_groups');
        });
    });
});
