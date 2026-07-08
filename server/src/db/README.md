# GapMiner PostgreSQL Database Setup Guide

Complete guide for setting up and managing the GapMiner PostgreSQL database.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Database Schema](#database-schema)
- [Migrations](#migrations)
- [Backup & Restore](#backup--restore)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

### Required Software

1. **PostgreSQL 14+** (16 recommended)

   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install postgresql-16 postgresql-contrib-16
   
   # macOS (Homebrew)
   brew install postgresql@16
   
   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. **pgvector Extension** (for vector embeddings)

   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql-16-pgvector
   
   # macOS (Homebrew)
   brew install pgvector
   
   # From source
   git clone https://github.com/pgvector/pgvector.git
   cd pgvector
   make
   sudo make install
   ```

### Optional Extensions

- **pg_cron** - For scheduled jobs
- **pg_stat_statements** - For query performance monitoring

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# 1. Set environment variables
export DATABASE_URL="postgresql://postgres:password@localhost:5432/gapminer"

# 2. Create database and run initialization
cd server
npm install
npm run db:init
```

### Option 2: Manual Setup

```bash
# 1. Create database
psql -U postgres -c "CREATE DATABASE gapminer;"

# 2. Run initialization script
psql -U postgres -d gapminer -f server/src/db/init-database.sql

# 3. Verify setup
psql -U postgres -d gapminer -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

### Option 3: Docker Setup

```bash
# 1. Start PostgreSQL with Docker
docker run -d \
  --name gapminer-postgres \
  -e POSTGRES_DB=gapminer \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -v gapminer_pgdata:/var/lib/postgresql/data \
  pgvector/pgvector:pg16

# 2. Wait for PostgreSQL to start
docker exec gapminer-postgres pg_isready

# 3. Initialize database
docker exec -i gapminer-postgres psql -U postgres -d gapminer < server/src/db/schema.sql
```

## 📊 Database Schema

### Core Tables

#### Users & Authentication

- `users` - User accounts
- `sessions` - Refresh tokens
- `subscriptions` - Subscription tiers
- `usage_records` - Usage tracking
- `api_keys` - API authentication

#### Research Data

- `papers` - Research papers
- `gaps` - Research gaps extracted from papers
- `collections` - User-organized collections
- `collection_papers` - Papers in collections
- `collection_gaps` - Gaps in collections

#### Collaboration

- `teams` - Research teams
- `team_members` - Team membership
- `organizations` - Research organizations
- `organization_members` - Organization membership
- `comments` - Collaborative comments
- `annotations` - Document annotations
- `annotation_replies` - Threaded replies

#### Features

- `chat_sessions` - Research chat sessions
- `chat_messages` - Chat message history
- `workflows` - Automated workflows
- `workflow_runs` - Workflow execution history
- `batch_jobs` - Background processing jobs
- `grant_opportunities` - Funding opportunities
- `grant_proposals` - Grant applications

#### Knowledge Graph

- `knowledge_nodes` - Graph nodes (papers, concepts, etc.)
- `knowledge_edges` - Graph relationships

#### Analytics & ML

- `embeddings` - Vector embeddings for search
- `model_versions` - ML model tracking
- `ab_tests` - A/B testing framework
- `trending_topics` - Trend detection
- `research_signals` - Signal analysis

#### System

- `llm_call_logs` - LLM API usage tracking
- `audit_logs` - Activity audit trail
- `webhooks` - Webhook integrations

### Entity Relationship Diagram

```
users (1) ─── (many) papers
users (1) ─── (many) gaps
users (1) ─── (many) collections
users (1) ─── (1) subscriptions
users (1) ─── (many) team_members
papers (1) ─── (many) gaps
collections (many) ─── (many) papers [collection_papers]
collections (many) ─── (many) gaps [collection_gaps]
```

## 🔄 Migrations

### Running Migrations

```bash
# Run all pending migrations
npm run db:migrate

# Run specific migration
npm run db:migrate:specific 001_public_api.sql

# Rollback last migration
npm run db:rollback

# Check migration status
npm run db:migrate:status
```

### Creating New Migrations

```bash
# Generate migration file
npm run db:migrate:create add_feature_name

# Edit the generated file at: server/src/db/migrations/XXX_add_feature_name.sql
```

### Migration Best Practices

1. **Always use transactions** - Wrap DDL in BEGIN/COMMIT
2. **Make migrations reversible** - Include rollback logic
3. **Test on staging first** - Never run untested migrations on production
4. **Backup before migrating** - Always have a restore point
5. **Keep migrations small** - One logical change per migration

## 💾 Backup & Restore

### Full Database Backup

```bash
# Create backup
pg_dump -U postgres -d gapminer -F c -f gapminer_backup_$(date +%Y%m%d_%H%M%S).dump

# With compression
pg_dump -U postgres -d gapminer -F c -Z 9 -f gapminer_backup.dump
```

### Schema-Only Backup

```bash
pg_dump -U postgres -d gapminer --schema-only -f gapminer_schema.sql
```

### Data-Only Backup

```bash
pg_dump -U postgres -d gapminer --data-only -f gapminer_data.sql
```

### Restore Database

```bash
# Drop and recreate database
dropdb -U postgres gapminer
createdb -U postgres gapminer

# Restore from custom format
pg_restore -U postgres -d gapminer gapminer_backup.dump

# Restore from SQL file
psql -U postgres -d gapminer -f gapminer_backup.sql
```

### Automated Backups (Linux/macOS)

```bash
# Create backup script
cat > /usr/local/bin/backup-gapminer.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/gapminer"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
pg_dump -U postgres -d gapminer -F c -f "$BACKUP_DIR/gapminer_$TIMESTAMP.dump"
# Keep only last 7 days
find $BACKUP_DIR -name "*.dump" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-gapminer.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add line: 0 2 * * * /usr/local/bin/backup-gapminer.sh
```

## ⚡ Performance Tuning

### Recommended PostgreSQL Configuration

Edit `postgresql.conf`:

```ini
# Memory Settings (adjust based on RAM)
shared_buffers = 4GB                    # 25% of RAM
effective_cache_size = 12GB             # 75% of RAM
maintenance_work_mem = 1GB
work_mem = 64MB

# Checkpoint Settings
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
wal_buffers = 16MB
max_wal_size = 4GB

# Query Planner
random_page_cost = 1.1                  # For SSD
effective_io_concurrency = 200          # For SSD

# Parallel Query
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
max_worker_processes = 8

# Logging (for development)
log_min_duration_statement = 1000       # Log queries > 1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
```

### Analyze & Vacuum

```sql
-- Manual vacuum and analyze
VACUUM ANALYZE;

-- Analyze specific table
ANALYZE papers;

-- Vacuum specific table
VACUUM FULL papers;

-- Check table bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Index Maintenance

```sql
-- Rebuild all indexes
REINDEX DATABASE gapminer;

-- Rebuild specific table indexes
REINDEX TABLE papers;

-- Check unused indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1
ORDER BY n_distinct DESC;
```

### Query Performance

```sql
-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries
SELECT query, calls, total_time, mean_time, max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Most frequently run queries
SELECT query, calls, total_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;

-- Reset statistics
SELECT pg_stat_statements_reset();
```

## 🔍 Troubleshooting

### Connection Issues

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check listening ports
sudo netstat -tulpn | grep postgres

# Test connection
psql -U postgres -d gapminer -c "SELECT version();"

# Check authentication
cat /etc/postgresql/16/main/pg_hba.conf
```

### Common Errors

**Error: relation does not exist**

```sql
-- Check if table exists
SELECT * FROM information_schema.tables WHERE table_name = 'users';

-- Run schema
\i server/src/db/schema.sql
```

**Error: permission denied**

```sql
-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE gapminer TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
```

**Error: could not extend file**

```bash
# Check disk space
df -h

# Check PostgreSQL data directory
du -sh /var/lib/postgresql/16/main/
```

### Database Monitoring

```sql
-- Current connections
SELECT datname, count(*) 
FROM pg_stat_activity 
GROUP BY datname;

-- Long running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;

-- Kill long running query
SELECT pg_terminate_backend(pid);

-- Database size
SELECT pg_size_pretty(pg_database_size('gapminer'));

-- Table sizes
SELECT tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
       pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [PostgreSQL Best Practices](https://wiki.postgresql.org/wiki/Don't_Do_This)

## 🆘 Support

If you encounter issues:

1. Check the logs: `tail -f /var/log/postgresql/postgresql-16-main.log`
2. Review this documentation
3. Search existing GitHub issues
4. Create a new issue with error details and logs

---

**Last Updated:** 2026-03-07
