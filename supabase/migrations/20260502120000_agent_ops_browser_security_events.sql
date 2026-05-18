-- ============================================================================
-- Agent Ops Browser Trust Shield
--
-- Browser-specific security ledger for prompt-injection signals, canary leaks,
-- hidden-content warnings, and low-level action policy. This complements the
-- generic agent_ops_security_attempts table without replacing it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_browser_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE CASCADE,

  browser_session_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'canary_leak',
      'prompt_injection_pattern',
      'hidden_content',
      'low_level_action_blocked',
      'classifier_warning',
      'private_network_blocked',
      'handoff_required'
    )),
  severity TEXT NOT NULL
    CHECK (severity IN ('info', 'warn', 'block')),
  layer TEXT NOT NULL
    CHECK (layer IN ('browser_content', 'browser_action', 'browser_output', 'classifier', 'network')),
  host TEXT,
  url_hash TEXT,
  content_hash TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_security_events_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_security_events_org_created
  ON agent_ops_browser_security_events(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_security_events_project_created
  ON agent_ops_browser_security_events(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_security_events_run_created
  ON agent_ops_browser_security_events(ops_run_id, created_at DESC)
  WHERE ops_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_security_events_severity
  ON agent_ops_browser_security_events(org_id, severity, event_type, created_at DESC);

ALTER TABLE agent_ops_browser_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_browser_security_events_org_select ON agent_ops_browser_security_events;
CREATE POLICY agent_ops_browser_security_events_org_select ON agent_ops_browser_security_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_security_events_service_all ON agent_ops_browser_security_events;
CREATE POLICY agent_ops_browser_security_events_service_all ON agent_ops_browser_security_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
