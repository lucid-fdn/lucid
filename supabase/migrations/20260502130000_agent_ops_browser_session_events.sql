-- ============================================================================
-- Agent Ops Browser Live Session Events + Handoff
--
-- Append-only Browser Operator timeline events. The existing
-- agent_ops_browser_qa_sessions table remains the compact session index; this
-- table stores live/handoff/resume events for Mission Control and channels.
-- ============================================================================

ALTER TABLE agent_ops_browser_qa_sessions
  DROP CONSTRAINT IF EXISTS agent_ops_browser_qa_sessions_status_check;

ALTER TABLE agent_ops_browser_qa_sessions
  ADD CONSTRAINT agent_ops_browser_qa_sessions_status_check CHECK (
    status IN (
      'queued',
      'running',
      'completed',
      'failed',
      'expired',
      'handoff_required',
      'waiting_for_human',
      'resumed'
    )
  );

CREATE TABLE IF NOT EXISTS agent_ops_browser_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  browser_session_id UUID REFERENCES agent_ops_browser_qa_sessions(id) ON DELETE SET NULL,

  session_key TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'session_started',
      'navigated',
      'ready',
      'evidence_collected',
      'screenshot_captured',
      'handoff_required',
      'handoff_resolved',
      'session_resumed',
      'session_completed',
      'session_failed',
      'heartbeat'
    )),
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warn', 'error')),
  handoff_state TEXT
    CHECK (
      handoff_state IS NULL
      OR handoff_state IN (
        'auth_required',
        'captcha_required',
        'mfa_required',
        'destructive_confirmation_required',
        'human_judgment_required'
      )
    ),

  current_url TEXT,
  artifact_id UUID REFERENCES agent_ops_artifacts(id) ON DELETE SET NULL,
  screenshot_uri TEXT,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_session_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_events_run
  ON agent_ops_browser_session_events(org_id, ops_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_events_session
  ON agent_ops_browser_session_events(org_id, ops_run_id, session_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_events_handoff
  ON agent_ops_browser_session_events(org_id, handoff_state, created_at DESC)
  WHERE handoff_state IS NOT NULL;

ALTER TABLE agent_ops_browser_session_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_browser_session_events_org_select ON agent_ops_browser_session_events;
CREATE POLICY agent_ops_browser_session_events_org_select ON agent_ops_browser_session_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_session_events_service_all ON agent_ops_browser_session_events;
CREATE POLICY agent_ops_browser_session_events_service_all ON agent_ops_browser_session_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
