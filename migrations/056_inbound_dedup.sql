-- Migration 056: Inbound deduplication table
-- Phase 1A: Prevents duplicate message processing from webhook retries

CREATE TABLE IF NOT EXISTS assistant_inbound_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES assistant_channels(id) ON DELETE CASCADE,
  external_message_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, external_message_id)
);

-- Index for TTL cleanup job
CREATE INDEX IF NOT EXISTS idx_inbound_dedup_cleanup
  ON assistant_inbound_dedup(received_at);

-- Comment
COMMENT ON TABLE assistant_inbound_dedup IS
  'Deduplication guard for inbound webhook messages. TTL: 24h. See docs/OPENCLAW_INTEGRATION_SPEC.md §2.1';