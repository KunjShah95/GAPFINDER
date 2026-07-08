-- ============================================================================
-- Migration 003: Research Alerts
-- Adds research alerts and notifications
-- ============================================================================

-- Alert notifications table
CREATE TABLE IF NOT EXISTS alert_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID REFERENCES research_alerts(id) ON DELETE CASCADE,
    paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    notification_type VARCHAR(20) DEFAULT 'in_app' CHECK (notification_type IN ('in_app', 'email', 'push')),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_alert ON alert_notifications(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_user ON alert_notifications(alert_id, is_read);

-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(500) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Email notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_alerts BOOLEAN DEFAULT TRUE,
    push_alerts BOOLEAN DEFAULT TRUE,
    in_app_alerts BOOLEAN DEFAULT TRUE,
    alert_frequency VARCHAR(20) DEFAULT 'daily' CHECK (alert_frequency IN ('instant', 'daily', 'weekly')),
    notify_on_gaps BOOLEAN DEFAULT TRUE,
    notify_on_papers BOOLEAN DEFAULT TRUE,
    notify_on_community BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert sources
ALTER TABLE research_alerts ADD COLUMN IF NOT EXISTS sources VARCHAR[] DEFAULT ARRAY['arxiv', 'semantic_scholar'];
ALTER TABLE research_alerts ADD COLUMN IF NOT EXISTS match_type VARCHAR(20) DEFAULT 'keyword' CHECK (match_type IN ('keyword', 'author', 'venue', 'exact'));
