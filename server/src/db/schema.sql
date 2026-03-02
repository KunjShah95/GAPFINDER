-- ============================================================================
-- GapMiner PostgreSQL Schema
-- Complete database schema for the research gap discovery platform
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar TEXT,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
    is_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- SUBSCRIPTION & BILLING
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team', 'enterprise')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    payment_provider VARCHAR(20),
    external_subscription_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);

-- ============================================================================
-- USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    papers_processed INTEGER DEFAULT 0,
    gaps_extracted INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0,
    export_count INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_user_period ON usage_records(user_id, period_start);

CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user ON usage_events(user_id, created_at);

-- ============================================================================
-- PAPERS & CRAWL RESULTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS papers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT,
    authors TEXT[] DEFAULT '{}',
    venue VARCHAR(255),
    year INTEGER,
    content TEXT,
    citation_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_papers_user ON papers(user_id, created_at DESC);
CREATE INDEX idx_papers_url ON papers(url);
CREATE INDEX idx_papers_venue ON papers(venue);
CREATE INDEX idx_papers_year ON papers(year);

-- Full-text search on papers
ALTER TABLE papers ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX idx_papers_search ON papers USING GIN(search_vector);

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

DROP TRIGGER IF EXISTS papers_search_update ON papers;
CREATE TRIGGER papers_search_update
    BEFORE INSERT OR UPDATE ON papers
    FOR EACH ROW EXECUTE FUNCTION papers_search_trigger();

-- ============================================================================
-- RESEARCH GAPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS gaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('data', 'compute', 'evaluation', 'theory', 'deployment', 'methodology')),
    confidence DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    impact_score VARCHAR(10) DEFAULT 'medium' CHECK (impact_score IN ('low', 'medium', 'high')),
    difficulty VARCHAR(10) DEFAULT 'medium' CHECK (difficulty IN ('low', 'medium', 'high')),
    assumptions TEXT[] DEFAULT '{}',
    failures TEXT[] DEFAULT '{}',
    dataset_gaps TEXT[] DEFAULT '{}',
    evaluation_critique TEXT,
    upvotes INTEGER DEFAULT 0,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gaps_paper ON gaps(paper_id);
CREATE INDEX idx_gaps_user ON gaps(user_id, created_at DESC);
CREATE INDEX idx_gaps_type ON gaps(type);
CREATE INDEX idx_gaps_impact ON gaps(impact_score);
CREATE INDEX idx_gaps_resolved ON gaps(is_resolved);

-- Full-text search on gaps
ALTER TABLE gaps ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX idx_gaps_search ON gaps USING GIN(search_vector);

CREATE OR REPLACE FUNCTION gaps_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        COALESCE(NEW.problem, '') || ' ' ||
        COALESCE(NEW.evaluation_critique, '') || ' ' ||
        COALESCE(array_to_string(NEW.assumptions, ' '), '') || ' ' ||
        COALESCE(array_to_string(NEW.failures, ' '), '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gaps_search_update ON gaps;
CREATE TRIGGER gaps_search_update
    BEFORE INSERT OR UPDATE ON gaps
    FOR EACH ROW EXECUTE FUNCTION gaps_search_trigger();

-- ============================================================================
-- COLLECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6366f1',
    starred BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_collections_user ON collections(user_id, created_at DESC);

-- Junction table for gaps in collections
CREATE TABLE IF NOT EXISTS collection_gaps (
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    gap_id UUID NOT NULL REFERENCES gaps(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (collection_id, gap_id)
);

-- Junction table for papers in collections
CREATE TABLE IF NOT EXISTS collection_papers (
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (collection_id, paper_id)
);

-- ============================================================================
-- TEAMS & COLLABORATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{"isPublic": false, "allowComments": true, "allowAnnotations": true}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);

-- ============================================================================
-- COMMENTS & ANNOTATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL,
    document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('paper', 'collection', 'gap')),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    mentions TEXT[] DEFAULT '{}',
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_document ON comments(document_id, document_type);
CREATE INDEX idx_comments_user ON comments(user_id);

-- ============================================================================
-- GAP VOTES (Community Feature)
-- ============================================================================

CREATE TABLE IF NOT EXISTS gap_votes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gap_id UUID NOT NULL REFERENCES gaps(id) ON DELETE CASCADE,
    vote_type INTEGER NOT NULL DEFAULT 1 CHECK (vote_type IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, gap_id)
);

-- ============================================================================
-- RESEARCH ALERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    frequency VARCHAR(20) DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    sources TEXT[] DEFAULT '{arxiv}',
    match_type VARCHAR(20) DEFAULT 'keyword' CHECK (match_type IN ('keyword', 'author', 'venue')),
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user ON research_alerts(user_id);

-- ============================================================================
-- ALERT NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID NOT NULL REFERENCES research_alerts(id) ON DELETE CASCADE,
    paper_id UUID REFERENCES papers(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT,
    notification_type VARCHAR(20) DEFAULT 'in_app' CHECK (notification_type IN ('in_app', 'email', 'push')),
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_notif_alert ON alert_notifications(alert_id, created_at DESC);
CREATE INDEX idx_alert_notif_read ON alert_notifications(is_read) WHERE is_read = FALSE;

-- ============================================================================
-- NOTIFICATION PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_alerts BOOLEAN DEFAULT TRUE,
    push_alerts BOOLEAN DEFAULT TRUE,
    in_app_alerts BOOLEAN DEFAULT TRUE,
    alert_frequency VARCHAR(20) DEFAULT 'daily' CHECK (alert_frequency IN ('realtime', 'daily', 'weekly')),
    notify_on_gaps BOOLEAN DEFAULT TRUE,
    notify_on_papers BOOLEAN DEFAULT TRUE,
    notify_on_community BOOLEAN DEFAULT TRUE,
    weekly_digest BOOLEAN DEFAULT TRUE,
    marketing_emails BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- USER PROFILES (extended community profile)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    institution VARCHAR(255),
    avatar_url TEXT,
    website TEXT,
    github VARCHAR(100),
    twitter VARCHAR(100),
    linkedin VARCHAR(100),
    is_public BOOLEAN DEFAULT TRUE,
    total_shared_gaps INTEGER DEFAULT 0,
    total_upvotes_received INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- USER FOLLOWS (community social graph)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_follows (
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON user_follows(follower_id);
CREATE INDEX idx_follows_following ON user_follows(following_id);

-- ============================================================================
-- PUBLIC GAPS (community-shared research gaps)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public_gaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gap_id UUID NOT NULL REFERENCES gaps(id) ON DELETE CASCADE,
    share_reason TEXT,
    upvotes INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gap_id)
);

CREATE INDEX idx_public_gaps_user ON public_gaps(user_id);
CREATE INDEX idx_public_gaps_upvotes ON public_gaps(upvotes DESC);

-- ============================================================================
-- PUBLIC GAP VOTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public_gap_votes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_gap_id UUID NOT NULL REFERENCES public_gaps(id) ON DELETE CASCADE,
    vote_type INTEGER NOT NULL DEFAULT 1 CHECK (vote_type IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, public_gap_id)
);

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(30) DEFAULT 'lab' CHECK (type IN ('lab', 'university', 'company', 'research_institute')),
    website TEXT,
    logo_url TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{"allowPublicView": false, "requireApproval": true}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orgs_owner ON organizations(owner_id);

-- ============================================================================
-- ORGANIZATION MEMBERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'invited', 'removed')),
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);

-- ============================================================================
-- API KEYS (for external access)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    permissions TEXT[] DEFAULT '{"read"}',
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================================================
-- GAMIFICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_xp (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    papers_analyzed INTEGER DEFAULT 0,
    gaps_found INTEGER DEFAULT 0,
    comments_made INTEGER DEFAULT 0,
    collaborations INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tier VARCHAR(20) DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_achievements_user ON achievements(user_id);

-- ============================================================================
-- WEBHOOKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(255) NOT NULL,
    events TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    failure_count INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_user ON webhooks(user_id);

-- ============================================================================
-- LLM / OBSERVABILITY LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    operation VARCHAR(100) NOT NULL,
    model VARCHAR(50) NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    cost DECIMAL(10,6) DEFAULT 0,
    success BOOLEAN DEFAULT TRUE,
    error TEXT,
    session_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llm_logs_user ON llm_call_logs(user_id, created_at DESC);
CREATE INDEX idx_llm_logs_operation ON llm_call_logs(operation, created_at DESC);

-- ============================================================================
-- SESSIONS (for refresh tokens)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================================================
-- HELPER FUNCTION: Auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply auto-update triggers
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY['users', 'subscriptions', 'papers', 'gaps', 'collections', 'teams', 'comments', 'research_alerts', 'user_profiles', 'organizations'])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON %s
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$;
