-- ============================================================================
-- Notifications System
-- ============================================================================

-- Add new columns to notification_preferences to support more granular control
ALTER TABLE notification_preferences 
ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS types JSONB DEFAULT '{"new_paper":true,"gap_found":true,"team_invite":true,"subscription_alert":true,"system_update":true,"weekly_digest":true}',
ADD COLUMN IF NOT EXISTS digest_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (digest_frequency IN ('never', 'daily', 'weekly'));

-- Create user notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'system',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- Migrate old preferences to new format (if needed)
UPDATE notification_preferences 
SET 
    email_enabled = COALESCE(email_alerts, true),
    push_enabled = COALESCE(push_alerts, true),
    types = CASE 
        WHEN notify_on_gaps = TRUE AND notify_on_papers = TRUE AND notify_on_community = TRUE THEN 
            '{"new_paper":true,"gap_found":true,"team_invite":true,"subscription_alert":true,"system_update":true,"weekly_digest":true}'
        WHEN notify_on_gaps = TRUE AND notify_on_papers = FALSE AND notify_on_community = FALSE THEN
            '{"new_paper":false,"gap_found":true,"team_invite":true,"subscription_alert":true,"system_update":true,"weekly_digest":true}'
        ELSE types
    END,
    digest_frequency = CASE 
        WHEN alert_frequency = 'realtime' THEN 'never'
        WHEN alert_frequency = 'daily' THEN 'daily'
        WHEN alert_frequency = 'weekly' THEN 'weekly'
        ELSE 'weekly'
    END
WHERE email_enabled IS NULL;