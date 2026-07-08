-- ============================================================================
-- Migration 007: New Features
-- Bookmarks, Tags, Annotations, Activity, Webhooks extensions
-- ============================================================================

-- ============================================================================
-- Tags
-- ============================================================================
CREATE TABLE IF NOT EXISTS tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(50) NOT NULL,
    color       VARCHAR(7) DEFAULT '#f97316',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);

-- ============================================================================
-- Bookmarks
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookmarks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_id   UUID NOT NULL,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('paper', 'gap', 'collection')),
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entity_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_entity ON bookmarks(entity_id, entity_type);

-- ============================================================================
-- Bookmark-Tag join table
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookmark_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(bookmark_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmark_tags_bookmark ON bookmark_tags(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag ON bookmark_tags(tag_id);

-- ============================================================================
-- Annotations
-- ============================================================================
CREATE TABLE IF NOT EXISTS annotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_id        UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    highlight_text  TEXT NOT NULL,
    note            TEXT,
    color           VARCHAR(7) DEFAULT '#fbbf24',
    start_offset    INTEGER,
    end_offset      INTEGER,
    section         VARCHAR(255),
    tags            TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE annotations ADD COLUMN IF NOT EXISTS paper_id UUID REFERENCES papers(id) ON DELETE CASCADE;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS highlight_text TEXT;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS start_offset INTEGER;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS end_offset INTEGER;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS section VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_annotations_user ON annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_paper ON annotations(paper_id);
CREATE INDEX IF NOT EXISTS idx_annotations_user_paper ON annotations(user_id, paper_id);

-- ============================================================================
-- Achievements (expanded)
-- ============================================================================
CREATE TABLE IF NOT EXISTS achievements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id  VARCHAR(100) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    tier            VARCHAR(20) DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
    unlocked_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);

-- ============================================================================
-- Ensure user_xp has the needed columns
-- ============================================================================
DO $$
BEGIN
    -- Add streak columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_xp' AND column_name = 'current_streak') THEN
        ALTER TABLE user_xp ADD COLUMN current_streak INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_xp' AND column_name = 'longest_streak') THEN
        ALTER TABLE user_xp ADD COLUMN longest_streak INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_xp' AND column_name = 'last_activity_date') THEN
        ALTER TABLE user_xp ADD COLUMN last_activity_date DATE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_xp' AND column_name = 'comments_made') THEN
        ALTER TABLE user_xp ADD COLUMN comments_made INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_xp' AND column_name = 'collaborations') THEN
        ALTER TABLE user_xp ADD COLUMN collaborations INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_xp' AND column_name = 'papers_analyzed') THEN
        ALTER TABLE user_xp ADD COLUMN papers_analyzed INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- Ensure webhooks table has all fields
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhooks' AND column_name = 'name') THEN
        ALTER TABLE webhooks ADD COLUMN name VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhooks' AND column_name = 'is_active') THEN
        ALTER TABLE webhooks ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhooks' AND column_name = 'failure_count') THEN
        ALTER TABLE webhooks ADD COLUMN failure_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhooks' AND column_name = 'last_triggered_at') THEN
        ALTER TABLE webhooks ADD COLUMN last_triggered_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================================================
-- Ensure public_gaps has extra columns
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'public_gaps' AND column_name = 'view_count') THEN
        ALTER TABLE public_gaps ADD COLUMN view_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'public_gaps' AND column_name = 'share_reason') THEN
        ALTER TABLE public_gaps ADD COLUMN share_reason TEXT;
    END IF;
END $$;

-- ============================================================================
-- Apply updated_at triggers
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bookmarks_updated_at') THEN
        CREATE TRIGGER update_bookmarks_updated_at
            BEFORE UPDATE ON bookmarks
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_annotations_updated_at') THEN
        CREATE TRIGGER update_annotations_updated_at
            BEFORE UPDATE ON annotations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
