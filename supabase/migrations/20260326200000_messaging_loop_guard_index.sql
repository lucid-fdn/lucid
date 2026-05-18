-- =============================================================================
-- Migration: Loop Guard Index for Cross-Agent Messaging
--
-- Adds composite index on assistant_inbound_events for the loop protection
-- query in messaging.ts. Without this, loop guard scans all recent events
-- to check for same-sender→target pairs within the 5s cooldown window.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_inbound_events_loop_guard
  ON assistant_inbound_events (external_user_id, external_chat_id, created_at DESC)
  WHERE status = 'pending';

-- Also add a partial index for agent-type channels to speed up ensureAgentChannel lookups
CREATE INDEX IF NOT EXISTS idx_assistant_channels_agent_type
  ON assistant_channels (assistant_id)
  WHERE channel_type = 'agent' AND is_active = true;
