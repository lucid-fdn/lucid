-- ============================================================================
-- Migration 083: Add 'agent' channel type for cross-agent messaging
--
-- Enables agent-to-agent communication via synthetic inbound events.
-- Agent channels don't need webhook secrets or external IDs.
-- ============================================================================

-- 1. Expand channel_type CHECK to include 'agent'
ALTER TABLE assistant_channels DROP CONSTRAINT IF EXISTS assistant_channels_channel_type_check;
ALTER TABLE assistant_channels ADD CONSTRAINT assistant_channels_channel_type_check
  CHECK (channel_type IN ('telegram', 'whatsapp', 'web', 'discord', 'slack', 'agent'));

COMMENT ON COLUMN assistant_channels.channel_type IS 'Channel type: telegram, whatsapp, web, discord, slack, agent';

-- 2. Allow nullable secret_token_hash for agent channels (they have no webhooks)
-- Previously NOT NULL, but agent channels don't need webhook validation.
ALTER TABLE assistant_channels ALTER COLUMN secret_token_hash DROP NOT NULL;
