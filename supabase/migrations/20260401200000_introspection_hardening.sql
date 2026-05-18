-- Introspection Stream Hardening: tool_call_id for event pairing, seq for deterministic ordering

ALTER TABLE mc_introspection_events
  ADD COLUMN IF NOT EXISTS tool_call_id UUID,
  ADD COLUMN IF NOT EXISTS seq INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_introspection_tool_call
  ON mc_introspection_events (tool_call_id)
  WHERE tool_call_id IS NOT NULL;
