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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

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

CREATE INDEX IF NOT EXISTS idx_usage_user_period ON usage_records(user_id, period_start);

CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id, created_at);

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

CREATE INDEX IF NOT EXISTS idx_papers_user ON papers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_url ON papers(url);
CREATE INDEX IF NOT EXISTS idx_papers_venue ON papers(venue);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);

-- Full-text search on papers
ALTER TABLE papers ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_papers_search ON papers USING GIN(search_vector);

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

CREATE INDEX IF NOT EXISTS idx_gaps_paper ON gaps(paper_id);
CREATE INDEX IF NOT EXISTS idx_gaps_user ON gaps(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gaps_type ON gaps(type);
CREATE INDEX IF NOT EXISTS idx_gaps_impact ON gaps(impact_score);
CREATE INDEX IF NOT EXISTS idx_gaps_resolved ON gaps(is_resolved);

-- Full-text search on gaps
ALTER TABLE gaps ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_gaps_search ON gaps USING GIN(search_vector);

-- Gap metadata columns
ALTER TABLE gaps ADD COLUMN IF NOT EXISTS upvotes INTEGER DEFAULT 0;
ALTER TABLE gaps ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE gaps ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE gaps ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE gaps ADD COLUMN IF NOT EXISTS dataset_gaps TEXT[] DEFAULT '{}';

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
    color VARCHAR(7) DEFAULT '#f97316',
    starred BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

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

CREATE INDEX IF NOT EXISTS idx_comments_document ON comments(document_id, document_type);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

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

CREATE INDEX IF NOT EXISTS idx_alerts_user ON research_alerts(user_id);

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

CREATE INDEX IF NOT EXISTS idx_alert_notif_alert ON alert_notifications(alert_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_notif_read ON alert_notifications(is_read) WHERE is_read = FALSE;

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

CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id);

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
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gap_id)
);

ALTER TABLE public_gaps ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_public_gaps_user ON public_gaps(user_id);
CREATE INDEX IF NOT EXISTS idx_public_gaps_upvotes ON public_gaps(upvotes DESC);

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

CREATE INDEX IF NOT EXISTS idx_orgs_owner ON organizations(owner_id);

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

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);

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

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================================================
-- API USAGE LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    endpoint VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    tokens_used INTEGER DEFAULT 0,
    cost DECIMAL(10,6) DEFAULT 0,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_time ON api_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_key_time ON api_usage_logs(api_key_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);

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

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);

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

CREATE INDEX IF NOT EXISTS idx_llm_logs_user ON llm_call_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_operation ON llm_call_logs(operation, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================================================
-- CHAT SESSIONS & MESSAGES (Research Chat)
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    paper_ids UUID[] DEFAULT '{}',
    message_count INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_archived ON chat_sessions(is_archived) WHERE is_archived = FALSE;

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);

-- ============================================================================
-- GRANT OPPORTUNITIES & PROPOSALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS grant_opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    agency VARCHAR(255) NOT NULL,
    program VARCHAR(255),
    url TEXT,
    deadline DATE,
    amount INTEGER,
    description TEXT,
    eligibility TEXT[] DEFAULT '{}',
    requirements TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    foa_url TEXT,
    contact_email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grants_agency ON grant_opportunities(agency);
CREATE INDEX IF NOT EXISTS idx_grants_deadline ON grant_opportunities(deadline) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_grants_keywords ON grant_opportunities USING GIN(keywords);

CREATE TABLE IF NOT EXISTS grant_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES grant_opportunities(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    abstract TEXT,
    research_question TEXT,
    methodology TEXT,
    expected_outcomes TEXT[] DEFAULT '{}',
    budget JSONB DEFAULT '{}',
    timeline TEXT,
    team_members JSONB DEFAULT '[]',
    gap_ids UUID[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected', 'revision')),
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_user ON grant_proposals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON grant_proposals(status);

-- ============================================================================
-- KNOWLEDGE GRAPH (Nodes & Edges)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_type VARCHAR(50) NOT NULL CHECK (node_type IN ('paper', 'gap', 'concept', 'author', 'institution', 'dataset', 'method')),
    label VARCHAR(500) NOT NULL,
    properties JSONB DEFAULT '{}',
    embedding JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_user ON knowledge_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON knowledge_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_label ON knowledge_nodes USING GIN(to_tsvector('english', label));

CREATE TABLE IF NOT EXISTS knowledge_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    edge_type VARCHAR(50) NOT NULL CHECK (edge_type IN ('cites', 'addresses', 'uses', 'extends', 'contradicts', 'authored_by', 'affiliated_with')),
    weight DECIMAL(3,2) DEFAULT 1.0,
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON knowledge_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON knowledge_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_type ON knowledge_edges(edge_type);

-- ============================================================================
-- WORKFLOWS & AUTOMATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN ('manual', 'schedule', 'event', 'webhook')),
    trigger_config JSONB DEFAULT '{}',
    steps JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    last_run_status VARCHAR(20),
    run_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_user ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS workflow_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error TEXT,
    duration_ms INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);

-- ============================================================================
-- BATCH JOBS & AI PIPELINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('gap_extraction', 'citation_analysis', 'trend_prediction', 'impact_scoring', 'similarity_clustering')),
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    input_data JSONB NOT NULL,
    output_data JSONB DEFAULT '{}',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user ON batch_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status) WHERE status IN ('queued', 'processing');

-- ============================================================================
-- EXPORT HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS export_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    export_type VARCHAR(50) NOT NULL CHECK (export_type IN ('pdf', 'csv', 'json', 'markdown', 'latex', 'bibtex')),
    resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('paper', 'gap', 'collection', 'analysis')),
    resource_ids UUID[] DEFAULT '{}',
    file_size INTEGER,
    download_url TEXT,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_history_user ON export_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_history_expires ON export_history(expires_at);

-- ============================================================================
-- ANNOTATIONS (for collaborative highlighting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL,
    document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('paper', 'gap')),
    selection_text TEXT NOT NULL,
    paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
    highlight_text TEXT,
    note TEXT,
    color VARCHAR(7) DEFAULT '#FFEB3B',
    start_offset INTEGER,
    end_offset INTEGER,
    section VARCHAR(255),
    position JSONB NOT NULL,
    tags TEXT[] DEFAULT '{}',
    is_shared BOOLEAN DEFAULT FALSE,
    reply_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE annotations ADD COLUMN IF NOT EXISTS paper_id UUID REFERENCES papers(id) ON DELETE CASCADE;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS highlight_text TEXT;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS start_offset INTEGER;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS end_offset INTEGER;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS section VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_annotations_document ON annotations(document_id, document_type);
CREATE INDEX IF NOT EXISTS idx_annotations_user ON annotations(user_id);

CREATE TABLE IF NOT EXISTS annotation_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    annotation_id UUID NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotation_replies_annotation ON annotation_replies(annotation_id, created_at);

-- ============================================================================
-- ML MODEL VERSIONS & AB TESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_type VARCHAR(50) NOT NULL CHECK (model_type IN ('gap_classifier', 'impact_predictor', 'recommendation_engine', 'embedding_model')),
    version VARCHAR(50) NOT NULL,
    architecture TEXT,
    training_config JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    is_production BOOLEAN DEFAULT FALSE,
    deployed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(model_type, version)
);

CREATE INDEX IF NOT EXISTS idx_model_versions_type ON model_versions(model_type);
CREATE INDEX IF NOT EXISTS idx_model_versions_production ON model_versions(is_production) WHERE is_production = TRUE;

CREATE TABLE IF NOT EXISTS ab_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    control_variant VARCHAR(100) NOT NULL,
    test_variant VARCHAR(100) NOT NULL,
    allocation_ratio DECIMAL(3,2) DEFAULT 0.5 CHECK (allocation_ratio >= 0 AND allocation_ratio <= 1),
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMPTZ DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_active ON ab_tests(is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS ab_test_assignments (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    variant VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, test_id)
);

-- ============================================================================
-- DATASET & BENCHMARK TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS datasets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    source VARCHAR(100) NOT NULL,
    task_type TEXT[] DEFAULT '{}',
    size INTEGER,
    url TEXT,
    license VARCHAR(100),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    quality_score JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datasets_name ON datasets(name);
CREATE INDEX IF NOT EXISTS idx_datasets_task ON datasets USING GIN(task_type);
CREATE INDEX IF NOT EXISTS idx_datasets_source ON datasets(source);

CREATE TABLE IF NOT EXISTS benchmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    task_type VARCHAR(100) NOT NULL,
    dataset_id UUID REFERENCES datasets(id) ON DELETE SET NULL,
    metrics JSONB DEFAULT '{}',
    leaderboard_url TEXT,
    sota_performance DECIMAL(5,2),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_task ON benchmarks(task_type);
CREATE INDEX IF NOT EXISTS idx_benchmarks_dataset ON benchmarks(dataset_id);

-- ============================================================================
-- RESEARCH LANDSCAPE & COMPETITOR TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    institution VARCHAR(255),
    website TEXT,
    focus_areas TEXT[] DEFAULT '{}',
    key_researchers TEXT[] DEFAULT '{}',
    publication_count INTEGER DEFAULT 0,
    h_index INTEGER,
    recent_papers UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_groups_name ON research_groups(name);
CREATE INDEX IF NOT EXISTS idx_research_groups_institution ON research_groups(institution);

CREATE TABLE IF NOT EXISTS commercial_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    company_type VARCHAR(50) CHECK (company_type IN ('startup', 'big_tech', 'research_lab')),
    website TEXT,
    focus_areas TEXT[] DEFAULT '{}',
    funding_stage VARCHAR(50),
    funding_amount INTEGER,
    employee_count INTEGER,
    key_products TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_players_name ON commercial_players(name);
CREATE INDEX IF NOT EXISTS idx_commercial_players_type ON commercial_players(company_type);

-- ============================================================================
-- TRENDING & SIGNAL DETECTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS trending_topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic VARCHAR(255) NOT NULL,
    category VARCHAR(50),
    mention_count INTEGER DEFAULT 1,
    growth_rate DECIMAL(5,2),
    sentiment_score DECIMAL(3,2),
    related_papers UUID[] DEFAULT '{}',
    related_gaps UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(topic, date)
);

CREATE INDEX IF NOT EXISTS idx_trending_topics_date ON trending_topics(date DESC);
CREATE INDEX IF NOT EXISTS idx_trending_topics_growth ON trending_topics(growth_rate DESC);
CREATE INDEX IF NOT EXISTS idx_trending_topics_category ON trending_topics(category);

CREATE TABLE IF NOT EXISTS research_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_type VARCHAR(50) NOT NULL CHECK (signal_type IN ('emerging_method', 'dataset_shift', 'benchmark_plateau', 'funding_trend', 'citation_spike')),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    confidence DECIMAL(3,2) DEFAULT 0.5,
    strength VARCHAR(20) DEFAULT 'medium' CHECK (strength IN ('weak', 'medium', 'strong')),
    evidence JSONB DEFAULT '[]',
    related_papers UUID[] DEFAULT '{}',
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    is_verified BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_signals_type ON research_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_detected ON research_signals(detected_at DESC);

-- ============================================================================
-- EMBEDDINGS STORAGE (for vector search)
-- ============================================================================

CREATE TABLE IF NOT EXISTS embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('paper', 'gap', 'dataset', 'concept')),
    embedding_model VARCHAR(100) NOT NULL,
    vector JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, entity_type, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_entity ON embeddings(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(embedding_model);

-- ============================================================================
-- AUDIT LOG (for compliance and debugging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    changes JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

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
        SELECT unnest(ARRAY[
            'users', 'subscriptions', 'papers', 'gaps', 'collections', 'teams', 
            'comments', 'research_alerts', 'user_profiles', 'organizations',
            'chat_sessions', 'grant_opportunities', 'grant_proposals', 'knowledge_nodes',
            'workflows', 'annotations', 'datasets', 'benchmarks', 'research_groups', 'commercial_players'
        ])
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
