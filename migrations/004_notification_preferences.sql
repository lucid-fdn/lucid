-- ============================================================================
-- Notification Preferences Table - SAFE FOR EXISTING TABLES
-- ============================================================================
-- This migration creates a new table, it never modifies existing data
-- Uses IF NOT EXISTS to avoid conflicts with existing tables

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Community notifications (email + web)
    posts_email BOOLEAN DEFAULT true,
    posts_web BOOLEAN DEFAULT true,
    watched_activity_email BOOLEAN DEFAULT true,
    watched_activity_web BOOLEAN DEFAULT true,
    
    -- Other notifications (email only)
    features_announcements BOOLEAN DEFAULT true,
    org_join_requests BOOLEAN DEFAULT true,
    org_suggestions BOOLEAN DEFAULT false,
    new_followers BOOLEAN DEFAULT true,
    gated_repo_requests BOOLEAN DEFAULT true,
    billing_notifications BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON notification_preferences(user_id);

-- Add trigger for auto-updating updated_at (Safe - checks if exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_notification_preferences_updated_at') THEN
        CREATE TRIGGER update_notification_preferences_updated_at 
            BEFORE UPDATE ON notification_preferences 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- Function to create default notification preferences
-- ============================================================================
CREATE OR REPLACE FUNCTION create_default_notification_prefs()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notification_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create notification preferences for new users (Safe - checks if exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_create_notification_prefs') THEN
        CREATE TRIGGER trigger_create_notification_prefs
            AFTER INSERT ON profiles
            FOR EACH ROW
            EXECUTE FUNCTION create_default_notification_prefs();
    END IF;
END $$;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own notification preferences
CREATE POLICY "Users can view own notification prefs"
ON notification_preferences FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notification preferences
CREATE POLICY "Users can update own notification prefs"
ON notification_preferences FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can insert their own notification preferences
CREATE POLICY "Users can insert own notification prefs"
ON notification_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Verification
-- ============================================================================
-- Run this to verify table was created:
-- SELECT * FROM notification_preferences LIMIT 1;
