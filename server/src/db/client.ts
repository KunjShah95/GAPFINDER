// ============================================================================
// PostgreSQL Database Client
// Connection pool with health checks and query logging
// ============================================================================

import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
    if (!pool) {
        pool = new Pool({
            connectionString: config.databaseUrl,
            max: config.dbPoolMax,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        pool.on('error', (err) => {
            console.error('[DB] Unexpected pool error:', err.message);
        });

        pool.on('connect', () => {
            console.log('[DB] New client connected to pool');
        });
    }
    return pool;
}

// Query helper with logging
export async function query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
): Promise<pg.QueryResult<T>> {
    const start = Date.now();
    const pool = getPool();

    try {
        const result = await pool.query<T>(text, params);
        const duration = Date.now() - start;

        if (config.isDev && duration > 100) {
            console.warn(`[DB] Slow query (${duration}ms):`, text.slice(0, 100));
        }

        return result;
    } catch (error) {
        const duration = Date.now() - start;
        console.error(`[DB] Query failed (${duration}ms):`, text.slice(0, 100), error);
        throw error;
    }
}

// Transaction helper
export async function transaction<T>(
    fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Health check
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
        await query('SELECT 1');
        return { ok: true, latencyMs: Date.now() - start };
    } catch {
        return { ok: false, latencyMs: Date.now() - start };
    }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('[DB] Pool closed');
    }
}
