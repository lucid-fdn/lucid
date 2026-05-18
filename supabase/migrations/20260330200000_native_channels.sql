-- Phase 2: C2a Self-Sovereign Agents — native channel state + governance actions

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS native_channels JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_actions JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN dedicated_runtimes.native_channels
  IS 'C2a: native channel connection status array, reported via heartbeat';
COMMENT ON COLUMN dedicated_runtimes.pending_actions
  IS 'C2a: governance actions queue, consumed and cleared on next heartbeat';
