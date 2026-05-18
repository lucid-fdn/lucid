-- Knowledge operation audit/eval capture ledger.
-- This keeps external-agent/API/tool calls observable without adding another
-- memory, RAG, run, or source model.

CREATE TABLE IF NOT EXISTS knowledge_operation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operation_id TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'app_api'
    CHECK (surface IN ('app_api', 'mission_control', 'worker_tool', 'mcp', 'agent_ops', 'external_agent')),
  success BOOLEAN NOT NULL DEFAULT false,
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  input_hash TEXT,
  output_summary TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_operation_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_knowledge_operation_events_org_created
  ON knowledge_operation_events(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_operation_events_operation
  ON knowledge_operation_events(org_id, operation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_operation_events_failures
  ON knowledge_operation_events(org_id, operation_id, created_at DESC)
  WHERE success = false;

ALTER TABLE knowledge_operation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_operation_events_org_select ON knowledge_operation_events
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_operation_events_service_all ON knowledge_operation_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
