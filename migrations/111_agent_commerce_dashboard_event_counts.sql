-- Migration 111: Agent Commerce dashboard event-count index.
-- Keeps exact production dashboard counts cheap as the Commerce event ledger grows.

CREATE INDEX IF NOT EXISTS idx_agent_commerce_events_org_event_type_created
  ON agent_commerce_events (org_id, event_type, created_at DESC);
