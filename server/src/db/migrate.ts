// ============================================================================
// Database Migration Runner
// Applies schema.sql to the PostgreSQL database
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
    console.log('[Migrate] Starting database migration...');

    try {
        // 1. Run base schema
        console.log('[Migrate] Applying base schema...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf-8');
            await query(schema);
            console.log('[Migrate] ✅ Base schema applied');
        } else {
            console.warn('[Migrate] ⚠️ schema.sql not found, skipping base schema');
        }

        // 2. Run migrations
        const migrationsDir = path.join(__dirname, 'migrations');
        if (fs.existsSync(migrationsDir)) {
            const files = fs.readdirSync(migrationsDir)
                .filter(f => f.endsWith('.sql'))
                .sort(); // Ensure alphabetical order

            console.log(`[Migrate] Found ${files.length} migration files in ${migrationsDir}`);

            for (const file of files) {
                console.log(`[Migrate] Applying ${file}...`);
                const migrationPath = path.join(migrationsDir, file);
                const sql = fs.readFileSync(migrationPath, 'utf-8');
                await query(sql);
                console.log(`[Migrate] ✅ ${file} applied`);
            }
        } else {
            console.log('[Migrate] No migrations directory found');
        }

        console.log('[Migrate] 🎉 All migrations completed successfully');
    } catch (error) {
        console.error('[Migrate] ❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await closePool();
    }
}

migrate();
