-- Agent Ops Browser QA usage/accounting ledger.
--
-- Browser sessions are intentionally provider-agnostic: OpenClaw-compatible
-- gateways, Steel, Browserless, and dedicated Playwright gateways should all
-- emit the same append-only accounting events. Quota, cost, audit, and cleanup
-- jobs can aggregate this table without inspecting provider-specific payloads.

CREATE TABLE IF NOT EXISTS agent_ops_browser_qa_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  target_id TEXT,
  step_id TEXT,
  provider TEXT NOT NULL DEFAULT 'playwright',
  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_started',
    'navigation',
    'action',
    'snapshot',
    'screenshot',
    'artifact_written',
    'session_closed',
    'session_expired',
    'error'
  )),
  target_url TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  bytes INTEGER CHECK (bytes IS NULL OR bytes >= 0),
  request_count INTEGER CHECK (request_count IS NULL OR request_count >= 0),
  console_error_count INTEGER CHECK (console_error_count IS NULL OR console_error_count >= 0),
  page_error_count INTEGER CHECK (page_error_count IS NULL OR page_error_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_qa_usage_events_metadata_object CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_qa_usage_events_run
  ON agent_ops_browser_qa_usage_events(org_id, ops_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_qa_usage_events_session
  ON agent_ops_browser_qa_usage_events(org_id, ops_run_id, session_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_qa_usage_events_type
  ON agent_ops_browser_qa_usage_events(event_type, created_at DESC);

ALTER TABLE agent_ops_browser_qa_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_browser_qa_usage_events_org_select
  ON agent_ops_browser_qa_usage_events;
CREATE POLICY agent_ops_browser_qa_usage_events_org_select
  ON agent_ops_browser_qa_usage_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members om
      WHERE om.organization_id = agent_ops_browser_qa_usage_events.org_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_qa_usage_events_service_all
  ON agent_ops_browser_qa_usage_events;
CREATE POLICY agent_ops_browser_qa_usage_events_service_all
  ON agent_ops_browser_qa_usage_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
