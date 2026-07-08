// ============================================================================
// Database Migration Runner
// Applies schema.sql to the PostgreSQL database
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Split SQL statements by semicolon (handling comments and PostgreSQL dollar-quoted strings)
function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let inDollarQuote = false;
    let dollarTag = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const nextChar = sql[i + 1];
        const prevChar = i > 0 ? sql[i - 1] : '';

        // Handle line comments (only if not in string)
        if (!inString && !inDollarQuote && char === '-' && nextChar === '-' && !inBlockComment) {
            inLineComment = true;
        }
        if (inLineComment && (char === '\n' || char === '\r')) {
            inLineComment = false;
        }

        // Handle block comments (only if not in string)
        if (!inString && !inDollarQuote && char === '/' && nextChar === '*' && !inLineComment) {
            inBlockComment = true;
        }
        if (char === '*' && nextChar === '/' && inBlockComment) {
            inBlockComment = false;
            i++; // skip next char
            current += '*';
            current += '/';
            continue;
        }

        // Skip if in comment
        if (inLineComment || inBlockComment) {
            current += char;
            continue;
        }

        // Handle PostgreSQL dollar-quoted strings: $tag$ ... $tag$
        if (char === '$' && !inString) {
            // Try to match a dollar quote
            let j = i + 1;
            let tag = '';
            while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
                tag += sql[j];
                j++;
            }
            if (j < sql.length && sql[j] === '$') {
                // Found a potential dollar quote
                if (!inDollarQuote) {
                    inDollarQuote = true;
                    dollarTag = tag;
                    current += sql.substring(i, j + 1);
                    i = j;
                    continue;
                } else if (tag === dollarTag) {
                    // Found closing dollar quote
                    inDollarQuote = false;
                    current += sql.substring(i, j + 1);
                    i = j;
                    continue;
                }
            }
        }

        // Handle regular quoted strings (only if not in dollar quote)
        if (!inDollarQuote && (char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }

        current += char;

        // Statement terminator (only if not in any string context)
        if (char === ';' && !inString && !inDollarQuote) {
            const trimmed = current.trim();
            if (trimmed) {
                statements.push(trimmed);
            }
            current = '';
        }
    }

    // Add any remaining statement
    const trimmed = current.trim();
    if (trimmed) {
        statements.push(trimmed);
    }

    return statements.filter(s => s.length > 0);
}

async function migrate() {
    console.log('[Migrate] Starting database migration...');

    try {
        // 1. Run base schema
        console.log('[Migrate] Applying base schema...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf-8');
            const statements = splitSqlStatements(schema);
            console.log(`[Migrate] Executing ${statements.length} statements from schema.sql`);
            for (const stmt of statements) {
                await query(stmt);
            }
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
                const statements = splitSqlStatements(sql);
                console.log(`[Migrate] Executing ${statements.length} statements from ${file}`);
                for (const stmt of statements) {
                    await query(stmt);
                }
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
