-- Migration 083: Add channel delivery to scheduled tasks
-- Stores originating channel_id so scheduled task output can be delivered back.

ALTER TABLE agent_scheduled_tasks
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES assistant_channels(id) ON DELETE SET NULL;

ALTER TABLE agent_scheduled_tasks
  ADD COLUMN IF NOT EXISTS last_run_output TEXT;

COMMENT ON COLUMN agent_scheduled_tasks.channel_id IS 'Originating channel for delivery. NULL = no delivery (fire-and-forget).';
COMMENT ON COLUMN agent_scheduled_tasks.last_run_output IS 'Last agent response text. Stored for debugging and web channel polling.';
