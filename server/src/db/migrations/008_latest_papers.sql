-- ============================================================================
-- Migration 008: Latest Papers from Famous Publishers
-- Global table (not per-user) storing the most recent papers fetched by the
-- cron job from well-known publishers (arXiv, PubMed, CrossRef, bioRxiv, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS latest_papers (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id   TEXT        NOT NULL,
    source        VARCHAR(50) NOT NULL,
    publisher     VARCHAR(50) NOT NULL,
    title         TEXT        NOT NULL,
    abstract      TEXT,
    url           TEXT        NOT NULL,
    authors       TEXT[]      DEFAULT '{}',
    venue         VARCHAR(255),
    year          INT,
    published_at  TIMESTAMPTZ,
    fetched_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (external_id, publisher)
);

CREATE INDEX IF NOT EXISTS idx_latest_papers_publisher   ON latest_papers (publisher);
CREATE INDEX IF NOT EXISTS idx_latest_papers_published   ON latest_papers (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_latest_papers_fetched     ON latest_papers (fetched_at DESC);

-- Cron run log — track each execution so the UI can show "last updated"
CREATE TABLE IF NOT EXISTS cron_run_log (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name   VARCHAR(100) NOT NULL,
    started_at TIMESTAMPTZ  DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    papers_fetched INT       DEFAULT 0,
    status     VARCHAR(20)  DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
    error_msg  TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_run_log_job ON cron_run_log (job_name, started_at DESC);
