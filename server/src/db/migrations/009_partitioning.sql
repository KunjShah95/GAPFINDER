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
    -- Create past partitions (last N months) + current + future partitions (next N months)
    FOR i IN -p_months_ahead..p_months_ahead LOOP
        v_start_date := date_trunc('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
        v_end_date := v_start_date + INTERVAL '1 month';
        v_partition_name := 'papers_' || to_char(v_start_date, 'YYYY_MM');

        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE c.relname = v_partition_name
              AND n.nspname = 'public'
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

-- UNIQUE constraint on id alone so single-column FKs can reference papers(id)
ALTER TABLE papers ADD CONSTRAINT papers_id_unique UNIQUE (id);

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
       source,
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

-- 2l. Recreate FK constraints that were dropped
--     Now that papers has a UNIQUE constraint on id, single-column FKs can reference it.
ALTER TABLE gaps
    ADD CONSTRAINT gaps_paper_id_fkey
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE;

ALTER TABLE collection_papers
    ADD CONSTRAINT collection_papers_paper_id_fkey
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE;

ALTER TABLE annotations
    ADD CONSTRAINT annotations_paper_id_fkey
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE;

ALTER TABLE alert_notifications
    ADD CONSTRAINT alert_notifications_paper_id_fkey
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE;

-- 2m. VACUUM ANALYZE to update planner statistics after bulk data migration
VACUUM ANALYZE papers;

-- 2n. Drop the old table
DROP TABLE IF EXISTS papers_old;
