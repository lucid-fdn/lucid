-- Agent Ops Browser QA evidence sessions.
--
-- Browser runs are stored as normal Agent Ops artifacts/findings, while this
-- table gives Mission Control a compact session index for screenshots,
-- console/network logs, perf captures, TTL cleanup, and handoff/resume UX.

CREATE TABLE IF NOT EXISTS agent_ops_browser_qa_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  session_key TEXT NOT NULL,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  owner_runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL,
  viewport JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_count INTEGER NOT NULL DEFAULT 0,
  last_artifact_id UUID REFERENCES agent_ops_artifacts(id) ON DELETE SET NULL,
  last_error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_ops_browser_qa_sessions_status_check CHECK (
    status IN ('queued', 'running', 'completed', 'failed', 'expired')
  ),
  CONSTRAINT agent_ops_browser_qa_sessions_target_url_check CHECK (
    target_url ~* '^https?://'
  ),
  CONSTRAINT agent_ops_browser_qa_sessions_viewport_object CHECK (
    jsonb_typeof(viewport) = 'object'
  ),
  CONSTRAINT agent_ops_browser_qa_sessions_metadata_object CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_browser_qa_sessions_key
  ON agent_ops_browser_qa_sessions(org_id, ops_run_id, session_key);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_qa_sessions_run
  ON agent_ops_browser_qa_sessions(ops_run_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_qa_sessions_org_status
  ON agent_ops_browser_qa_sessions(org_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_qa_sessions_expires
  ON agent_ops_browser_qa_sessions(expires_at)
  WHERE status IN ('completed', 'failed', 'expired');

ALTER TABLE agent_ops_browser_qa_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_browser_qa_sessions_org_select ON agent_ops_browser_qa_sessions;
CREATE POLICY agent_ops_browser_qa_sessions_org_select ON agent_ops_browser_qa_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members om
      WHERE om.organization_id = agent_ops_browser_qa_sessions.org_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_qa_sessions_service_all ON agent_ops_browser_qa_sessions;
CREATE POLICY agent_ops_browser_qa_sessions_service_all ON agent_ops_browser_qa_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_agent_ops_browser_qa_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_agent_ops_browser_qa_sessions_updated_at
  ON agent_ops_browser_qa_sessions;
CREATE TRIGGER touch_agent_ops_browser_qa_sessions_updated_at
  BEFORE UPDATE ON agent_ops_browser_qa_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_browser_qa_sessions_updated_at();
