-- ============================================================================
-- GapMiner PostgreSQL Database Initialization
-- Complete database setup script
-- ============================================================================
-- 
-- This script creates a fresh GAPMINER database with all necessary:
-- - Extensions
-- - Tables
-- - Indexes
-- - Triggers
-- - Functions
-- - Initial data
-- 
-- USAGE:
-- From command line:
-- psql -U postgres -f init-database.sql
-- 
-- Or manually:
-- 1. CREATE DATABASE gapminer;
-- 2. \c gapminer
-- 3. Run this script
-- ============================================================================

-- Create database (comment out if database already exists)
-- Note: This command must be run as postgres superuser
DROP DATABASE IF EXISTS gapminer;
CREATE DATABASE gapminer;

-- Connect to the database
\c gapminer;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram similarity for fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- GIN indexes for better performance

-- For vector embeddings (requires pgvector extension)
-- Install: sudo apt-get install postgresql-<version>-pgvector
-- Or follow: https://github.com/pgvector/pgvector
CREATE EXTENSION IF NOT EXISTS "vector";         -- Vector similarity search

-- ============================================================================
-- ENUMS (for better type safety)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'team', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gap_type AS ENUM ('data', 'compute', 'evaluation', 'theory', 'deployment', 'methodology');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE impact_level AS ENUM ('low', 'medium', 'high');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE processing_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate user level from XP
CREATE OR REPLACE FUNCTION calculate_level(xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN FLOOR(SQRT(xp / 100.0)) + 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
    p_user_id UUID,
    p_resource_type VARCHAR,
    p_tier subscription_tier
) RETURNS BOOLEAN AS $$
DECLARE
    v_usage INTEGER;
    v_limit INTEGER;
BEGIN
    -- Get current usage
    SELECT CASE 
        WHEN p_resource_type = 'papers' THEN papers_processed
        WHEN p_resource_type = 'gaps' THEN gaps_extracted
        WHEN p_resource_type = 'api_calls' THEN api_calls
        ELSE 0
    END INTO v_usage
    FROM usage_records
    WHERE user_id = p_user_id
    AND period_start <= NOW()
    AND period_end >= NOW()
    ORDER BY period_start DESC
    LIMIT 1;

    -- Get tier limits
    v_limit := CASE p_tier
        WHEN 'free' THEN 50
        WHEN 'pro' THEN 500
        WHEN 'team' THEN 2000
        WHEN 'enterprise' THEN 999999
    END;

    RETURN COALESCE(v_usage, 0) < v_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Now include the main schema
-- ============================================================================

\i schema.sql

-- ============================================================================
-- VIEWS for common queries
-- ============================================================================

-- Active users view
CREATE OR REPLACE VIEW v_active_users AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.role,
    s.tier,
    COUNT(DISTINCT p.id) as paper_count,
    COUNT(DISTINCT g.id) as gap_count,
    MAX(p.created_at) as last_activity
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
LEFT JOIN papers p ON u.id = p.user_id
LEFT JOIN gaps g ON u.id = g.user_id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email, u.name, u.role, s.tier;

-- Gap statistics view
CREATE OR REPLACE VIEW v_gap_statistics AS
SELECT 
    type,
    impact_score,
    COUNT(*) as count,
    AVG(confidence) as avg_confidence,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT paper_id) as unique_papers
FROM gaps
GROUP BY type, impact_score;

-- Popular papers view
CREATE OR REPLACE VIEW v_popular_papers AS
SELECT 
    p.*,
    COUNT(DISTINCT g.id) as gap_count,
    COUNT(DISTINCT cp.collection_id) as collection_count,
    AVG(g.confidence) as avg_gap_confidence
FROM papers p
LEFT JOIN gaps g ON p.id = g.paper_id
LEFT JOIN collection_papers cp ON p.id = cp.paper_id
GROUP BY p.id
ORDER BY gap_count DESC, collection_count DESC;

-- User activity summary
CREATE OR REPLACE VIEW v_user_activity AS
SELECT 
    u.id as user_id,
    u.name,
    u.email,
    s.tier,
    COUNT(DISTINCT p.id) as papers_analyzed,
    COUNT(DISTINCT g.id) as gaps_found,
    COUNT(DISTINCT c.id) as collections_created,
    COUNT(DISTINCT co.id) as comments_made,
    COALESCE(xp.total_xp, 0) as total_xp,
    COALESCE(xp.level, 1) as level
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
LEFT JOIN papers p ON u.id = p.user_id
LEFT JOIN gaps g ON u.id = g.user_id
LEFT JOIN collections c ON u.id = c.user_id
LEFT JOIN comments co ON u.id = co.user_id
LEFT JOIN user_xp xp ON u.id = xp.user_id
GROUP BY u.id, u.name, u.email, s.tier, xp.total_xp, xp.level;

-- ============================================================================
-- MATERIALIZED VIEWS for expensive queries
-- ============================================================================

-- Trending gaps (refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_trending_gaps AS
SELECT 
    g.id,
    g.problem,
    g.type,
    g.impact_score,
    COUNT(DISTINCT gv.user_id) as vote_count,
    COUNT(DISTINCT cp.collection_id) as collection_count,
    AVG(g.confidence) as avg_confidence,
    g.created_at
FROM gaps g
LEFT JOIN gap_votes gv ON g.id = gv.gap_id
LEFT JOIN collection_gaps cp ON g.id = cp.gap_id
WHERE g.created_at > NOW() - INTERVAL '30 days'
GROUP BY g.id, g.problem, g.type, g.impact_score, g.created_at
ORDER BY vote_count DESC, collection_count DESC
LIMIT 100;

CREATE UNIQUE INDEX idx_mv_trending_gaps_id ON mv_trending_gaps(id);

-- Research themes (refreshed daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_research_themes AS
SELECT 
    g.type,
    COUNT(*) as gap_count,
    ARRAY_AGG(DISTINCT substring(g.problem for 100)) as sample_problems,
    COUNT(DISTINCT g.user_id) as contributor_count,
    AVG(g.confidence) as avg_confidence
FROM gaps g
WHERE g.created_at > NOW() - INTERVAL '90 days'
GROUP BY g.type
ORDER BY gap_count DESC;

CREATE UNIQUE INDEX idx_mv_research_themes_type ON mv_research_themes(type);

-- ============================================================================
-- INDEXES for performance optimization
-- ============================================================================

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_papers_user_date ON papers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gaps_paper_user ON gaps(paper_id, user_id);
CREATE INDEX IF NOT EXISTS idx_gaps_type_impact ON gaps(type, impact_score);
CREATE INDEX IF NOT EXISTS idx_collections_user_starred ON collections(user_id, starred) WHERE starred = TRUE;
CREATE INDEX IF NOT EXISTS idx_usage_records_user_period ON usage_records(user_id, period_start, period_end);

-- GIN indexes for array and JSONB columns
CREATE INDEX IF NOT EXISTS idx_papers_authors_gin ON papers USING GIN(authors);
CREATE INDEX IF NOT EXISTS idx_papers_metadata_gin ON papers USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_gaps_metadata_gin ON gaps USING GIN(metadata);

-- Partial indexes for filtered queries
CREATE INDEX IF NOT EXISTS idx_gaps_unresolved ON gaps(created_at DESC) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(user_id) WHERE status = 'active';

-- ============================================================================
-- ROW LEVEL SECURITY (optional - for multi-tenant security)
-- ============================================================================

-- Enable RLS on sensitive tables (uncomment if needed)
-- ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE gaps ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

-- Example policy (users can only see their own data)
-- CREATE POLICY user_papers_policy ON papers
--     FOR ALL
--     TO authenticated_user
--     USING (user_id = current_user_id());

-- ============================================================================
-- INITIAL DATA (seed data for development)
-- ============================================================================

-- Create a demo admin user (CHANGE PASSWORD IN PRODUCTION!)
INSERT INTO users (id, email, password_hash, name, role, is_verified)
VALUES (
    uuid_generate_v4(),
    'admin@gapminer.com',
    crypt('admin123', gen_salt('bf', 12)),
    'Admin User',
    'admin',
    TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Insert default notification preferences for admin
INSERT INTO notification_preferences (user_id)
SELECT id FROM users WHERE email = 'admin@gapminer.com'
ON CONFLICT DO NOTHING;

-- Insert sample grant opportunities
INSERT INTO grant_opportunities (title, agency, program, deadline, amount, keywords, is_active)
VALUES
    ('AI Research Initiative', 'NSF', 'CISE', CURRENT_DATE + INTERVAL '90 days', 2000000, ARRAY['AI', 'machine learning', 'research'], TRUE),
    ('Biomedical Innovation Grant', 'NIH', 'NIGMS', CURRENT_DATE + INTERVAL '60 days', 500000, ARRAY['biomedical', 'health', 'innovation'], TRUE),
    ('Climate Tech Funding', 'DOE', 'ARPA-E', CURRENT_DATE + INTERVAL '120 days', 1500000, ARRAY['climate', 'energy', 'sustainability'], TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SCHEDULED JOBS (using pg_cron extension if available)
-- ============================================================================

-- Refresh materialized views daily
-- Uncomment if pg_cron is installed:
-- SELECT cron.schedule('refresh-trending-gaps', '0 2 * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trending_gaps;');
-- SELECT cron.schedule('refresh-themes', '0 3 * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_research_themes;');

-- Clean up old sessions weekly
-- SELECT cron.schedule('cleanup-sessions', '0 4 * * 0', 'DELETE FROM sessions WHERE expires_at < NOW();');

-- ============================================================================
-- PERMISSIONS (if using database roles)
-- ============================================================================

-- Create application user role (optional)
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gapminer_app') THEN
--         CREATE ROLE gapminer_app WITH LOGIN PASSWORD 'your_secure_password_here';
--     END IF;
-- END
-- $$;

-- Grant permissions
-- GRANT CONNECT ON DATABASE gapminer TO gapminer_app;
-- GRANT USAGE ON SCHEMA public TO gapminer_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gapminer_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gapminer_app;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE 'GapMiner Database Initialization Complete!';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE 'Database: gapminer';
    RAISE NOTICE 'Extensions: uuid-ossp, pgcrypto, pg_trgm, btree_gin, vector';
    RAISE NOTICE 'Tables: % created', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE');
    RAISE NOTICE 'Indexes: % created', (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public');
    RAISE NOTICE 'Views: % created', (SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public');
    RAISE NOTICE '────────────────────────────────────────────────────────────────';
    RAISE NOTICE 'Default admin user: admin@gapminer.com / admin123';
    RAISE NOTICE '⚠️  IMPORTANT: Change the admin password in production!';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;
