-- ============================================================================
-- Migration 067: Add Slack channel type
-- 
-- Adds 'slack' to the channel_type CHECK constraint.
-- Note: 'discord' was already added in migration 044.
-- ============================================================================

-- Drop existing constraint
ALTER TABLE assistant_channels DROP CONSTRAINT IF EXISTS assistant_channels_channel_type_check;

-- Add new constraint with slack included
ALTER TABLE assistant_channels ADD CONSTRAINT assistant_channels_channel_type_check
  CHECK (channel_type IN ('telegram', 'whatsapp', 'web', 'discord', 'slack'));

-- Update channel_config column comment for reference
COMMENT ON COLUMN assistant_channels.channel_type IS 'Channel type: telegram, whatsapp, web, discord, slack';