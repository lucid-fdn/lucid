-- ============================================================================
-- Update Notification Preferences - Channels and Features
-- ============================================================================
-- This migration migrates to a new channel-based system and cleans up old columns

-- Step 1: Add new columns if they don't exist
ALTER TABLE notification_preferences 
ADD COLUMN IF NOT EXISTS channel_web BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS channel_email BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS follow_web BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS follow_email BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS interactions_web BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS interactions_email BOOLEAN DEFAULT false;

-- Step 2: Drop old unused columns (no longer needed)
ALTER TABLE notification_preferences 
DROP COLUMN IF EXISTS email_follows,
DROP COLUMN IF EXISTS email_likes,
DROP COLUMN IF EXISTS email_ratings,
DROP COLUMN IF EXISTS push_follows,
DROP COLUMN IF EXISTS push_likes,
DROP COLUMN IF EXISTS push_ratings;

-- Step 3: Add comprehensive documentation
COMMENT ON TABLE notification_preferences IS 'User notification preferences using channel-based system';
COMMENT ON COLUMN notification_preferences.user_id IS 'References profiles.id';
COMMENT ON COLUMN notification_preferences.channel_web IS 'Master toggle for all web (toast) notifications';
COMMENT ON COLUMN notification_preferences.channel_email IS 'Master toggle for all email notifications';
COMMENT ON COLUMN notification_preferences.follow_web IS 'Web notifications for new followers';
COMMENT ON COLUMN notification_preferences.follow_email IS 'Email notifications for new followers';
COMMENT ON COLUMN notification_preferences.interactions_web IS 'Web notifications for asset interactions (ratings, bookmarks)';
COMMENT ON COLUMN notification_preferences.interactions_email IS 'Email notifications for asset interactions';
COMMENT ON COLUMN notification_preferences.updated_at IS 'Timestamp of last update';
