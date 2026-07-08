# Papers Table Partitioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostgreSQL range partitioning by `published_at` to the `papers` table with auto-managing partitions, covering indexes, and partition pruning in existing queries.

**Architecture:** Convert the existing `papers` table to a native range-partitioned table using `PARTITION BY RANGE (published_at)`. Since PostgreSQL doesn't support `ALTER TABLE ... PARTITION BY` on populated tables, we recreate the table with partitioning, migrate data, and rebuild indexes. A PL/pgSQL function auto-creates monthly partitions and optionally drops old ones.

**Tech Stack:** PostgreSQL 16, PL/pgSQL, Node.js/TypeScript (Express routes)

---

## Critical Context

The current `papers` table (defined in `server/src/db/schema.sql:84-98`) does NOT have `published_at`, `source`, or `categories` columns. However, `server/src/services/paper-sync.ts:99` and `server/src/services/alert-runner.ts:130` insert with a `source` column, suggesting it may exist in some environments. The migration must:

1. Add missing columns (`published_at`, `source`) to `papers` before partitioning
2. Drop and recreate `papers` as partitioned (PostgreSQL limitation)
3. Recreate all indexes, constraints, triggers, and foreign key references
4. **Drop FK constraints** from `gaps`, `collection_papers`, `annotations`, and `alert_notifications` that reference `papers` — PostgreSQL requires FK columns to match the referenced table's PK exactly, and the new PK is `(id, published_at)`. Since `gaps.paper_id` is just `UUID`, it cannot reference a composite PK. Application-level integrity is sufficient here (papers and gaps share `user_id`, deletes are user-scoped).

## File Structure

| File | Purpose |
|------|---------|
| Create: `server/src/db/migrations/009_partitioning.sql` | Main migration |
| Modify: `server/src/routes/papers.ts` | Add `published_at` to create schema, update list query |

---

## File Structure

| File | Purpose |
|------|---------|
| Create: `server/src/db/migrations/009_partitioning.sql` | Main migration |
| Modify: `server/src/routes/papers.ts` | Add `published_at` to create schema, update list query |
| Modify: `server/src/routes/latest-papers.ts` | Ensure partition pruning on `published_at` filter |

---

### Task 1: Create the partition management function

**Files:**
- Create: `server/src/db/migrations/009_partitioning.sql`

This function creates monthly partitions and is idempotent. It runs first so the table creation can reference it.

- [ ] **Step 1: Write the partition management function**

Add to `server/src/db/migrations/009_partitioning.sql`:

```sql
-- ============================================================================
-- Migration 009: Papers Table Partitioning
-- Range partitioning by published_at (monthly partitions)
-- ============================================================================

-- ============================================================================
-- STEP 1: Partition management function
-- ============================================================================

CREATE OR REPLACE FUNCTION manage_papers_partitions(
    p_months_ahead INTEGER DEFAULT 12,
    p_retention_months INTEGER DEFAULT 24
)
RETURNS TABLE(partition_name TEXT, action TEXT) AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_partition_name TEXT;
    v_cutoff_date DATE;
BEGIN
    -- Create future partitions (next N months)
    FOR i IN 0..p_months_ahead LOOP
        v_start_date := date_trunc('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
        v_end_date := v_start_date + INTERVAL '1 month';
        v_partition_name := 'papers_' || to_char(v_start_date, 'YYYY_MM');

        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = v_partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF papers FOR VALUES FROM (%L) TO (%L)',
                v_partition_name, v_start_date, v_end_date
            );
            partition_name := v_partition_name;
            action := 'CREATED';
            RETURN NEXT;
        END IF;
    END LOOP;

    -- Drop old partitions beyond retention
    IF p_retention_months > 0 THEN
        v_cutoff_date := date_trunc('month', CURRENT_DATE) - (p_retention_months || ' months')::INTERVAL;

        FOR v_partition_name IN
            SELECT c.relname::TEXT
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE c.relname LIKE 'papers_%'
              AND c.relkind = 'r'
              AND n.nspname = 'public'
              AND substring(c.relname FROM 'papers_(\d{4}_\d{2})') < to_char(v_cutoff_date, 'YYYY_MM')
            ORDER BY c.relname
        LOOP
            EXECUTE format('DROP TABLE IF EXISTS %I', v_partition_name);
            partition_name := v_partition_name;
            action := 'DROPPED';
            RETURN NEXT;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Verify function syntax**

Run in psql or a SQL client:
```sql
SELECT manage_papers_partitions(12, 24);
```
Expected: Returns rows listing created partition names with action 'CREATED' for the next 12 months.

---

### Task 2: Recreate `papers` as a partitioned table

**Files:**
- Modify: `server/src/db/migrations/009_partitioning.sql`

PostgreSQL cannot `ALTER TABLE ... PARTITION BY` on a table with data. We must: drop triggers, drop indexes, drop FK references, drop the table, recreate it partitioned, then restore everything.

**FK Decision:** The new `papers` PK is `(id, published_at)`. FK constraints from `gaps`, `collection_papers`, `annotations`, and `alert_notifications` reference `papers(id)` — but `id` alone is no longer a unique constraint on the partitioned table. PostgreSQL requires FK columns to match the referenced PK exactly. Therefore, we **drop these FK constraints** and rely on application-level integrity. This is safe because:
- All queries already filter by `user_id` (papers + gaps share user context)
- `ON DELETE CASCADE` behavior is handled by application logic when deleting papers
- The codebase already has patterns of application-level referential integrity

- [ ] **Step 1: Add the drop-and-recreate block**

Append to `server/src/db/migrations/009_partitioning.sql`:

```sql
-- ============================================================================
-- STEP 2: Recreate papers as partitioned table
-- ============================================================================

-- 2a. Drop FK constraints that reference papers
--     (gaps, collection_papers, annotations, alert_notifications)
--     These cannot reference a composite PK (id, published_at) from single-column FKs.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname, conrelid::regclass AS table_name
        FROM pg_constraint
        WHERE confrelid = 'papers'::regclass
          AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
        RAISE NOTICE 'Dropped FK % on %', r.conname, r.table_name;
    END LOOP;
END $$;

-- Also drop FKs from child tables that may reference papers
ALTER TABLE gaps DROP CONSTRAINT IF EXISTS gaps_paper_id_fkey;
ALTER TABLE collection_papers DROP CONSTRAINT IF EXISTS collection_papers_paper_id_fkey;
ALTER TABLE annotations DROP CONSTRAINT IF EXISTS annotations_paper_id_fkey;
ALTER TABLE alert_notifications DROP CONSTRAINT IF EXISTS alert_notifications_paper_id_fkey;

-- 2b. Drop triggers on papers
DROP TRIGGER IF EXISTS papers_search_update ON papers;
DROP TRIGGER IF EXISTS update_papers_updated_at ON papers;

-- 2c. Drop indexes on papers (they'll be recreated on partitions automatically)
DROP INDEX IF EXISTS idx_papers_user;
DROP INDEX IF EXISTS idx_papers_url;
DROP INDEX IF EXISTS idx_papers_venue;
DROP INDEX IF EXISTS idx_papers_year;
DROP INDEX IF EXISTS idx_papers_search;
DROP INDEX IF EXISTS idx_papers_user_date;
DROP INDEX IF EXISTS idx_papers_authors_gin;
DROP INDEX IF EXISTS idx_papers_metadata_gin;

-- 2d. Rename old table to papers_old for data migration
ALTER TABLE IF EXISTS papers RENAME TO papers_old;

-- 2e. Create new partitioned papers table
CREATE TABLE papers (
    id UUID DEFAULT uuid_generate_v4() NOT NULL,
    user_id UUID NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT,
    authors TEXT[] DEFAULT '{}',
    venue VARCHAR(255),
    year INTEGER,
    content TEXT,
    citation_count INTEGER DEFAULT 0,
    source VARCHAR(50),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    search_vector tsvector,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, published_at)
) PARTITION BY RANGE (published_at);

-- 2f. Create initial partitions (past 12 months + current + next 12 months)
SELECT manage_papers_partitions(12, 0);

-- 2g. Create a default partition for any data outside defined ranges
CREATE TABLE papers_default PARTITION OF papers DEFAULT;

-- 2h. Migrate data from papers_old
--     published_at defaults to created_at for existing rows
INSERT INTO papers (id, user_id, url, title, abstract, authors, venue, year,
                    content, citation_count, source, published_at, metadata,
                    search_vector, created_at, updated_at)
SELECT id, user_id, url, title, abstract, authors, venue, year,
       content, citation_count,
       NULL AS source,
       COALESCE(created_at, NOW()) AS published_at,
       metadata, search_vector, created_at, updated_at
FROM papers_old;

-- 2i. Recreate indexes on the partitioned table
--     PostgreSQL automatically creates these on all partitions
CREATE INDEX IF NOT EXISTS idx_papers_user ON papers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_url ON papers(url);
CREATE INDEX IF NOT EXISTS idx_papers_venue ON papers(venue);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_search ON papers USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_papers_authors_gin ON papers USING GIN(authors);
CREATE INDEX IF NOT EXISTS idx_papers_metadata_gin ON papers USING GIN(metadata);

-- Covering indexes for hot query paths
-- (source, published_at DESC) for list-by-source queries
CREATE INDEX IF NOT EXISTS idx_papers_source_date
    ON papers(source, published_at DESC);
-- (published_at DESC) for recency queries
CREATE INDEX IF NOT EXISTS idx_papers_published_desc
    ON papers(published_at DESC);

-- 2j. Recreate search trigger
CREATE OR REPLACE FUNCTION papers_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        COALESCE(NEW.title, '') || ' ' ||
        COALESCE(NEW.abstract, '') || ' ' ||
        COALESCE(NEW.venue, '') || ' ' ||
        COALESCE(array_to_string(NEW.authors, ' '), '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER papers_search_update
    BEFORE INSERT OR UPDATE ON papers
    FOR EACH ROW EXECUTE FUNCTION papers_search_trigger();

-- 2k. Recreate updated_at trigger
CREATE TRIGGER update_papers_updated_at
    BEFORE UPDATE ON papers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2l. Drop the old table
DROP TABLE IF EXISTS papers_old;
```

- [ ] **Step 2: Verify the migration runs without error**

Run against a test database:
```bash
psql -U postgres -d gapminer -f server/src/db/migrations/009_partitioning.sql
```
Expected: All notices about dropped FKs, no errors. `papers` is now partitioned.

---

### Task 3: Update `papers.ts` route for partition awareness

**Files:**
- Modify: `server/src/routes/papers.ts:17-36` (CreatePaperSchema)
- Modify: `server/src/routes/papers.ts:42-119` (GET /papers list query)

- [ ] **Step 1: Add `published_at` to the create schema**

In `server/src/routes/papers.ts`, update `CreatePaperSchema`:

```typescript
const CreatePaperSchema = z.object({
    url: z.string().url(),
    title: z.string().min(1).max(500),
    abstract: z.string().optional(),
    authors: z.array(z.string()).optional(),
    venue: z.string().optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    content: z.string().optional(),
    source: z.string().optional(),
    published_at: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});
```

- [ ] **Step 2: Update the INSERT to include `published_at`**

In `server/src/routes/papers.ts:184-188`, update the INSERT query:

```typescript
const paperResult = await client.query(
    `INSERT INTO papers (user_id, url, title, abstract, authors, venue, year, content, source, published_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()), $11)
     RETURNING *`,
    [
        req.user!.userId, url, title, abstract || null, authors || [],
        venue || null, year || null, content || null,
        source || null, published_at || null, metadata || {}
    ]
);
```

Note: The `source` and `published_at` variables come from the destructured `parsed.data`. Update the destructuring at line 180:

```typescript
const { url, title, abstract, authors, venue, year, content, source, published_at, metadata } = parsed.data;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd server && npx tsc --noEmit
```
Expected: No type errors.

---

### Task 4: Verify the full migration works end-to-end

- [ ] **Step 1: Run the migration on a test database**

```bash
psql -U postgres -d gapminer_test -f server/src/db/migrations/009_partitioning.sql
```

- [ ] **Step 2: Verify partition structure**

```sql
SELECT inhrelid::regclass AS partition_name
FROM pg_inherits
WHERE inhparent = 'papers'::regclass
ORDER BY partition_name;
```
Expected: 25+ partitions (12 past + current + 12 future + default).

- [ ] **Step 3: Test insert with partition pruning**

```sql
INSERT INTO papers (user_id, url, title, published_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'https://example.com', 'Test', NOW());

EXPLAIN ANALYZE SELECT * FROM papers WHERE published_at >= '2026-07-01' AND published_at < '2026-08-01';
```
Expected: Query plan shows `Index Scan` or `Seq Scan` on `papers_2026_07` only (partition pruning).

- [ ] **Step 4: Test the management function**

```sql
SELECT * FROM manage_papers_partitions(12, 24);
```
Expected: Returns rows for newly created partitions.

- [ ] **Step 5: Run TypeScript build and verify**

```bash
cd server && npx tsc --noEmit
```
Expected: No errors.

---

## Summary

| Deliverable | Path |
|-------------|------|
| Migration file | `server/src/db/migrations/009_partitioning.sql` |
| Route updates | `server/src/routes/papers.ts` |
| Partition function | `manage_papers_partitions()` (in migration) |
| Verification | Run migration, check partitions, test queries |

## How to Verify

1. **Partition existence:** `SELECT * FROM pg_inherits WHERE inhparent = 'papers'::regclass;`
2. **Partition pruning:** `EXPLAIN` a query with `WHERE published_at BETWEEN ...` — should show pruning
3. **Insert routing:** Insert a row with a specific `published_at` — should land in correct partition
4. **Function idempotency:** Run `manage_papers_partitions()` twice — second run should return no rows
5. **TypeScript:** `npx tsc --noEmit` passes with no errors
