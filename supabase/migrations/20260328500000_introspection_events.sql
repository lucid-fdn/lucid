-- Consciousness Stream (Introspection Stream) — Phase 1
-- Real-time agent observability events for live visualization.
-- Worker emits events during agent runs; browser subscribes via Supabase Realtime.

-- ─── Table ────────────────────────────────────────────────────────────
CREATE TABLE mc_introspection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'run_start', 'context_loaded', 'routing_decision',
    'llm_start', 'llm_end',
    'tool_start', 'tool_cache_hit', 'tool_result', 'tool_error',
    'approval_wait', 'approval_resolved',
    'cost_update',
    'memory_load', 'memory_extract',
    'subagent_spawn', 'subagent_complete',
    'run_end'
  )),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX idx_introspection_org_time ON mc_introspection_events (org_id, created_at DESC);
CREATE INDEX idx_introspection_agent_run ON mc_introspection_events (agent_id, run_id, created_at);

-- ─── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE mc_introspection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Introspection events visible to org members" ON mc_introspection_events
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- ─── Realtime ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mc_introspection_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_introspection_events;
  END IF;
END $$;
