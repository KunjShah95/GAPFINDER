-- ============================================================================
-- Migration 005: Paper Sync & Subscriptions
-- Auto-sync papers from arXiv and Semantic Scholar
-- ============================================================================

-- Paper subscriptions
CREATE TABLE IF NOT EXISTS paper_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    sources VARCHAR[] DEFAULT ARRAY['arxiv', 'semantic_scholar'],
    last_synced_at TIMESTAMPTZ,
    sync_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_subscriptions_user ON paper_subscriptions(user_id);

-- Synced papers (from auto-sync)
CREATE TABLE IF NOT EXISTS synced_papers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255),
    source VARCHAR(50) CHECK (source IN ('arxiv', 'semantic_scholar')),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES paper_subscriptions(id) ON DELETE SET NULL,
    paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(external_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_papers_subscription ON synced_papers(subscription_id);

-- ============================================================================
-- Migration 006: Resolution Tracking
-- Enhanced gap resolution tracking
-- ============================================================================

-- Gap resolutions (how gaps were solved)
CREATE TABLE IF NOT EXISTS gap_resolutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gap_id UUID REFERENCES gaps(id) ON DELETE CASCADE,
    paper_id UUID REFERENCES papers(id) ON DELETE SET NULL,
    resolution_method VARCHAR(100),
    notes TEXT,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gap_resolutions_gap ON gap_resolutions(gap_id);

-- Gap timeline events
CREATE TABLE IF NOT EXISTS gap_timeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gap_id UUID REFERENCES gaps(id) ON DELETE CASCADE,
    event_type VARCHAR(50) CHECK (event_type IN ('created', 'upvoted', 'resolved', 'commented', 'shared', 'saved')),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gap_timeline_gap ON gap_timeline(gap_id, created_at DESC);
