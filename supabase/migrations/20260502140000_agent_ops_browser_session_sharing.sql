-- ============================================================================
-- Agent Ops Browser Session Sharing
--
-- Scoped, short-lived pair-agent access for Browser Operator sessions. Tokens
-- are hashed at rest; every shared action is append-only audited with runtime,
-- assistant, agent label, and isolated tab attribution.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_browser_session_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,

  session_key TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scope TEXT NOT NULL
    CHECK (scope IN ('read-only', 'browser-drive', 'screenshot-only', 'handoff-only')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),

  granted_to_assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  granted_to_runtime_id TEXT,
  granted_to_agent_label TEXT,
  tab_identity TEXT NOT NULL,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 30
    CHECK (rate_limit_per_minute > 0 AND rate_limit_per_minute <= 120),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_user_id UUID,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_session_shares_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_shares_session
  ON agent_ops_browser_session_shares(org_id, ops_run_id, session_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_shares_active
  ON agent_ops_browser_session_shares(org_id, session_key, expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_shares_actor
  ON agent_ops_browser_session_shares(org_id, granted_to_assistant_id, granted_to_runtime_id, created_at DESC);

ALTER TABLE agent_ops_browser_session_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_browser_session_shares_org_select ON agent_ops_browser_session_shares;
CREATE POLICY agent_ops_browser_session_shares_org_select ON agent_ops_browser_session_shares
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_session_shares_service_all ON agent_ops_browser_session_shares;
CREATE POLICY agent_ops_browser_session_shares_service_all ON agent_ops_browser_session_shares
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS agent_ops_browser_session_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  browser_share_id UUID REFERENCES agent_ops_browser_session_shares(id) ON DELETE SET NULL,

  session_key TEXT NOT NULL,
  token_prefix TEXT,
  scope TEXT
    CHECK (
      scope IS NULL
      OR scope IN ('read-only', 'browser-drive', 'screenshot-only', 'handoff-only')
    ),
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'session_observed',
      'tab_assigned',
      'navigation_requested',
      'screenshot_requested',
      'handoff_requested',
      'handoff_resolved',
      'resume_requested',
      'action_blocked'
    )),
  status TEXT NOT NULL DEFAULT 'allowed'
    CHECK (status IN ('allowed', 'blocked', 'failed')),

  actor_assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  actor_runtime_id TEXT,
  actor_agent_label TEXT,
  tab_identity TEXT,
  current_url TEXT,
  artifact_id UUID REFERENCES agent_ops_artifacts(id) ON DELETE SET NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_session_actions_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_actions_run
  ON agent_ops_browser_session_actions(org_id, ops_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_actions_session
  ON agent_ops_browser_session_actions(org_id, ops_run_id, session_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_session_actions_actor
  ON agent_ops_browser_session_actions(org_id, actor_assistant_id, actor_runtime_id, created_at DESC);

ALTER TABLE agent_ops_browser_session_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_browser_session_actions_org_select ON agent_ops_browser_session_actions;
CREATE POLICY agent_ops_browser_session_actions_org_select ON agent_ops_browser_session_actions
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_session_actions_service_all ON agent_ops_browser_session_actions;
CREATE POLICY agent_ops_browser_session_actions_service_all ON agent_ops_browser_session_actions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
