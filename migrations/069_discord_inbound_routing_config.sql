-- Migration 069: Add inbound routing config for Discord channels
-- Prevents bot spam and supports multi-tenant filtering
-- Ref: Multi-Channel Integration Plan v3

-- Add inbound routing config (JSONB for flexibility)
ALTER TABLE assistant_channels
ADD COLUMN inbound_routing_config JSONB DEFAULT '{}'::jsonb;

-- Add comment explaining the config shape
COMMENT ON COLUMN assistant_channels.inbound_routing_config IS 
'Per-channel inbound filtering config. Shape:
{
  "dedicated_channel": false,       -- true = respond to ALL messages in this channel
  "prefix": null,                   -- e.g. "!ask" — only respond to messages starting with this
  "respond_on_mention": true,       -- respond when bot is @mentioned
  "thread_support": true,           -- continue conversations in threads
  "ignore_bots": true               -- ignore messages from other bots
}
Discord: at least one of dedicated_channel/prefix/respond_on_mention must be true.
Slack: typically dedicated_channel=true or respond_on_mention=true.';

-- Add index for quick lookup by channel type + routing mode
CREATE INDEX idx_assistant_channels_routing 
ON assistant_channels(channel_type) 
WHERE inbound_routing_config IS NOT NULL;