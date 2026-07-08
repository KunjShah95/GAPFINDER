-- ============================================================================
-- Migration 001: Public Gap API
-- Adds public API key management and rate limiting
-- ============================================================================

-- Add API key management columns to existing tables
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit INTEGER DEFAULT 60;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_window VARCHAR(10) DEFAULT 'minute';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS monthly_quota INTEGER;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS monthly_usage INTEGER DEFAULT 0;

-- Add public_gaps table for community sharing
CREATE TABLE IF NOT EXISTS public_gaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    gap_id UUID REFERENCES gaps(id) ON DELETE CASCADE,
    share_reason TEXT,
    upvotes INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gap_id)
);

ALTER TABLE public_gaps ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_public_gaps_upvotes ON public_gaps(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_public_gaps_featured ON public_gaps(is_featured DESC, created_at DESC);

-- Add gap votes for public gaps
CREATE TABLE IF NOT EXISTS public_gap_votes (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    public_gap_id UUID REFERENCES public_gaps(id) ON DELETE CASCADE,
    vote_type INTEGER NOT NULL DEFAULT 1 CHECK (vote_type IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, public_gap_id)
);

-- Add API usage tracking
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

-- Add user profiles for community
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    institution VARCHAR(255),
    avatar_url TEXT,
    website VARCHAR(255),
    github VARCHAR(100),
    twitter VARCHAR(100),
    linkedin VARCHAR(100),
    is_public BOOLEAN DEFAULT TRUE,
    total_shared_gaps INTEGER DEFAULT 0,
    total_upvotes_received INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add user following
CREATE TABLE IF NOT EXISTS user_follows (
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);

-- Add gap leaderboard cache
CREATE TABLE IF NOT EXISTS leaderboard_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period VARCHAR(20) NOT NULL, -- 'weekly', 'monthly', 'all_time'
    rank_data JSONB NOT NULL,
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_period ON leaderboard_cache(period);

-- Create trigger for public_gaps updated_at
CREATE OR REPLACE FUNCTION update_public_gaps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_public_gaps_updated_at ON public_gaps;
CREATE TRIGGER update_public_gaps_updated_at
    BEFORE UPDATE ON public_gaps
    FOR EACH ROW EXECUTE FUNCTION update_public_gaps_updated_at();
