-- ============================================================================
-- GapMiner PostgreSQL Quick Reference
-- Common queries and commands for database management
-- ============================================================================

-- ============================================================================
-- DATABASE INFO & STATISTICS
-- ============================================================================

-- Check database version
SELECT version();

-- Get database size
SELECT pg_size_pretty(pg_database_size('gapminer')) as db_size;

-- List all tables with sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                   pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Count total records in all tables
SELECT 
    schemaname,
    tablename,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Check table structure
\d+ users
\d+ papers
\d+ gaps

-- ============================================================================
-- USER MANAGEMENT
-- ============================================================================

-- Create new user
INSERT INTO users (email, password_hash, name, role, is_verified)
VALUES (
    'user@example.com',
    crypt('password123', gen_salt('bf', 12)),
    'John Doe',
    'user',
    TRUE
);

-- Find user by email
SELECT id, email, name, role, created_at, last_login_at
FROM users
WHERE email = 'user@example.com';

-- Update user password
UPDATE users
SET password_hash = crypt('new_password', gen_salt('bf', 12))
WHERE email = 'user@example.com';

-- List all users with subscription info
SELECT 
    u.id,
    u.email,
    u.name,
    u.role,
    s.tier,
    s.status,
    u.created_at
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
ORDER BY u.created_at DESC
LIMIT 20;

-- User activity summary
SELECT 
    u.email,
    u.name,
    COUNT(DISTINCT p.id) as papers_count,
    COUNT(DISTINCT g.id) as gaps_count,
    COUNT(DISTINCT c.id) as collections_count,
    MAX(p.created_at) as last_activity
FROM users u
LEFT JOIN papers p ON u.id = p.user_id
LEFT JOIN gaps g ON u.id = g.user_id
LEFT JOIN collections c ON u.id = c.user_id
GROUP BY u.id, u.email, u.name
ORDER BY last_activity DESC NULLS LAST;

-- Delete user and all related data (CASCADE will handle it)
DELETE FROM users WHERE email = 'user@example.com';

-- ============================================================================
-- RESEARCH PAPERS
-- ============================================================================

-- Recent papers
SELECT 
    id,
    title,
    venue,
    year,
    citation_count,
    created_at
FROM papers
ORDER BY created_at DESC
LIMIT 20;

-- Search papers by title or abstract
SELECT id, title, abstract, venue, year
FROM papers
WHERE search_vector @@ to_tsquery('english', 'machine & learning')
ORDER BY created_at DESC;

-- Papers with most gaps
SELECT 
    p.id,
    p.title,
    p.venue,
    p.year,
    COUNT(g.id) as gap_count,
    AVG(g.confidence) as avg_confidence
FROM papers p
LEFT JOIN gaps g ON p.id = g.paper_id
GROUP BY p.id
ORDER BY gap_count DESC
LIMIT 20;

-- Papers by venue
SELECT 
    venue,
    COUNT(*) as paper_count,
    AVG(citation_count) as avg_citations
FROM papers
WHERE venue IS NOT NULL
GROUP BY venue
ORDER BY paper_count DESC;

-- Papers by year
SELECT 
    year,
    COUNT(*) as paper_count
FROM papers
WHERE year IS NOT NULL
GROUP BY year
ORDER BY year DESC;

-- ============================================================================
-- RESEARCH GAPS
-- ============================================================================

-- Recent gaps
SELECT 
    g.id,
    g.problem,
    g.type,
    g.impact_score,
    g.confidence,
    p.title as paper_title,
    g.created_at
FROM gaps g
JOIN papers p ON g.paper_id = p.id
ORDER BY g.created_at DESC
LIMIT 20;

-- Gaps by type
SELECT 
    type,
    COUNT(*) as count,
    AVG(confidence) as avg_confidence
FROM gaps
GROUP BY type
ORDER BY count DESC;

-- High impact gaps
SELECT 
    g.id,
    g.problem,
    g.type,
    g.impact_score,
    g.confidence,
    p.title as paper_title
FROM gaps g
JOIN papers p ON g.paper_id = p.id
WHERE g.impact_score = 'high'
  AND g.confidence >= 0.7
ORDER BY g.confidence DESC, g.created_at DESC;

-- Unresolved gaps
SELECT 
    g.id,
    g.problem,
    g.type,
    g.impact_score,
    g.upvotes,
    g.created_at
FROM gaps g
WHERE g.is_resolved = FALSE
ORDER BY g.upvotes DESC, g.created_at DESC
LIMIT 20;

-- Search gaps
SELECT 
    g.id,
    g.problem,
    g.type,
    g.impact_score,
    p.title as paper_title
FROM gaps g
JOIN papers p ON g.paper_id = p.id
WHERE g.search_vector @@ to_tsquery('english', 'dataset | evaluation')
ORDER BY g.confidence DESC;

-- Gap statistics by user
SELECT 
    u.email,
    u.name,
    COUNT(g.id) as total_gaps,
    COUNT(g.id) FILTER (WHERE g.impact_score = 'high') as high_impact_gaps,
    AVG(g.confidence) as avg_confidence
FROM users u
LEFT JOIN gaps g ON u.id = g.user_id
GROUP BY u.id, u.email, u.name
HAVING COUNT(g.id) > 0
ORDER BY total_gaps DESC;

-- ============================================================================
-- COLLECTIONS
-- ============================================================================

-- User collections with counts
SELECT 
    c.id,
    c.name,
    c.description,
    c.starred,
    COUNT(DISTINCT cp.paper_id) as paper_count,
    COUNT(DISTINCT cg.gap_id) as gap_count,
    c.created_at
FROM collections c
LEFT JOIN collection_papers cp ON c.id = cp.collection_id
LEFT JOIN collection_gaps cg ON c.id = cg.collection_id
WHERE c.user_id = 'YOUR_USER_ID_HERE'
GROUP BY c.id
ORDER BY c.starred DESC, c.created_at DESC;

-- Popular collections
SELECT 
    c.name,
    u.name as owner,
    COUNT(DISTINCT cp.paper_id) + COUNT(DISTINCT cg.gap_id) as total_items,
    c.created_at
FROM collections c
JOIN users u ON c.user_id = u.id
LEFT JOIN collection_papers cp ON c.id = cp.collection_id
LEFT JOIN collection_gaps cg ON c.id = cg.collection_id
WHERE c.is_public = TRUE
GROUP BY c.id, c.name, u.name, c.created_at
ORDER BY total_items DESC
LIMIT 20;

-- ============================================================================
-- SUBSCRIPTION & USAGE
-- ============================================================================

-- Active subscriptions
SELECT 
    u.email,
    u.name,
    s.tier,
    s.status,
    s.current_period_start,
    s.current_period_end
FROM subscriptions s
JOIN users u ON s.user_id = u.id
WHERE s.status = 'active'
ORDER BY s.tier, u.created_at DESC;

-- Usage by tier
SELECT 
    s.tier,
    COUNT(DISTINCT u.id) as user_count,
    AVG(ur.papers_processed) as avg_papers,
    AVG(ur.gaps_extracted) as avg_gaps,
    AVG(ur.api_calls) as avg_api_calls
FROM subscriptions s
JOIN users u ON s.user_id = u.id
LEFT JOIN usage_records ur ON u.id = ur.user_id
WHERE s.status = 'active'
GROUP BY s.tier
ORDER BY 
    CASE s.tier
        WHEN 'free' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'team' THEN 3
        WHEN 'enterprise' THEN 4
    END;

-- Users near usage limits
SELECT 
    u.email,
    s.tier,
    ur.papers_processed,
    ur.gaps_extracted,
    ur.api_calls
FROM users u
JOIN subscriptions s ON u.id = s.user_id
LEFT JOIN usage_records ur ON u.id = ur.user_id
WHERE s.status = 'active'
  AND (
      (s.tier = 'free' AND ur.papers_processed > 40) OR
      (s.tier = 'pro' AND ur.papers_processed > 450)
  );

-- ============================================================================
-- ANALYTICS & INSIGHTS
-- ============================================================================

-- Daily active users (last 30 days)
SELECT 
    DATE(created_at) as date,
    COUNT(DISTINCT user_id) as active_users
FROM (
    SELECT user_id, created_at FROM papers
    UNION ALL
    SELECT user_id, created_at FROM gaps
    UNION ALL
    SELECT user_id, created_at FROM comments
) activity
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Top contributors
SELECT 
    u.name,
    u.email,
    COUNT(DISTINCT p.id) as papers_added,
    COUNT(DISTINCT g.id) as gaps_found,
    COUNT(DISTINCT c.id) as comments_made,
    COALESCE(xp.total_xp, 0) as total_xp
FROM users u
LEFT JOIN papers p ON u.id = p.user_id
LEFT JOIN gaps g ON u.id = g.user_id
LEFT JOIN comments c ON u.id = c.user_id
LEFT JOIN user_xp xp ON u.id = xp.user_id
GROUP BY u.id, u.name, u.email, xp.total_xp
ORDER BY total_xp DESC, gaps_found DESC
LIMIT 20;

-- Research trends (gap types over time)
SELECT 
    DATE_TRUNC('week', created_at) as week,
    type,
    COUNT(*) as count
FROM gaps
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY week, type
ORDER BY week DESC, count DESC;

-- Citation distribution
SELECT 
    CASE 
        WHEN citation_count = 0 THEN '0'
        WHEN citation_count BETWEEN 1 AND 10 THEN '1-10'
        WHEN citation_count BETWEEN 11 AND 50 THEN '11-50'
        WHEN citation_count BETWEEN 51 AND 100 THEN '51-100'
        ELSE '100+'
    END as citation_range,
    COUNT(*) as paper_count
FROM papers
GROUP BY citation_range
ORDER BY MIN(citation_count);

-- ============================================================================
-- PERFORMANCE MONITORING
-- ============================================================================

-- Current active connections
SELECT 
    datname,
    count(*) as connections
FROM pg_stat_activity
GROUP BY datname
ORDER BY connections DESC;

-- Long running queries
SELECT 
    pid,
    now() - query_start AS duration,
    state,
    query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- Table bloat check
SELECT 
    schemaname,
    tablename,
    ROUND(100 * pg_relation_size(schemaname||'.'||tablename) / 
          NULLIF(pg_total_relation_size(schemaname||'.'||tablename), 0), 2) AS table_bloat_pct
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY table_bloat_pct DESC;

-- Index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 20;

-- Unused indexes (never used)
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;

-- ============================================================================
-- MAINTENANCE COMMANDS
-- ============================================================================

-- Vacuum and analyze all tables
VACUUM ANALYZE;

-- Vacuum specific table
VACUUM ANALYZE papers;

-- Reindex database
REINDEX DATABASE gapminer;

-- Refresh materialized views
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trending_gaps;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_research_themes;

-- ============================================================================
-- DATA CLEANUP
-- ============================================================================

-- Delete expired sessions
DELETE FROM sessions WHERE expires_at < NOW();

-- Delete old usage events (keep last 90 days)
DELETE FROM usage_events WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete old LLM logs (keep last 30 days)
DELETE FROM llm_call_logs WHERE created_at < NOW() - INTERVAL '30 days';

-- Delete expired export files
DELETE FROM export_history WHERE expires_at < NOW();

-- Delete old audit logs (keep last 180 days)
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '180 days';

-- ============================================================================
-- BACKUP COMMANDS (run from command line)
-- ============================================================================

-- Full backup:
-- pg_dump -U postgres -d gapminer -F c -f gapminer_backup.dump

-- Schema only:
-- pg_dump -U postgres -d gapminer --schema-only -f gapminer_schema.sql

-- Data only:
-- pg_dump -U postgres -d gapminer --data-only -f gapminer_data.sql

-- Specific table:
-- pg_dump -U postgres -d gapminer -t papers -f papers_backup.sql

-- Restore:
-- pg_restore -U postgres -d gapminer gapminer_backup.dump

-- ============================================================================
-- USEFUL VIEWS (already created in schema)
-- ============================================================================

-- Active users view
SELECT * FROM v_active_users LIMIT 10;

-- Gap statistics
SELECT * FROM v_gap_statistics;

-- Popular papers
SELECT * FROM v_popular_papers LIMIT 10;

-- User activity summary
SELECT * FROM v_user_activity WHERE papers_analyzed > 0 LIMIT 10;

-- Trending gaps (materialized view)
SELECT * FROM mv_trending_gaps LIMIT 10;

-- Research themes
SELECT * FROM mv_research_themes;
