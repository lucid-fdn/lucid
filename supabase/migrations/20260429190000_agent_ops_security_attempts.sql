-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.752Z.

-- Remote migration version: 20260429190000

-- Remote migration name: agent_ops_security_attempts



-- ============================================================================
-- Agent Ops security attempts
--
-- Observable trust-boundary log for prompt-injection attempts, hidden browser
-- content, suspicious channel/file input, and other untrusted-content events.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_security_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'channel_message',
    'attachment',
    'browser_output',
    'memory_snippet',
    'tool_output',
    'web_fetch',
    'repo_diff',
    'user_input',
    'project_learning',
    'agent_ops_api',
    'canary_leak',
    'model_classifier'
  )),
  source_ref TEXT,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'mitigated')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT agent_ops_security_attempts_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_security_attempts_org_status
  ON agent_ops_security_attempts(org_id, status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_security_attempts_project
  ON agent_ops_security_attempts(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_security_attempts_ops_run
  ON agent_ops_security_attempts(ops_run_id, created_at DESC)
  WHERE ops_run_id IS NOT NULL;

ALTER TABLE agent_ops_security_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_security_attempts_org_select ON agent_ops_security_attempts;

CREATE POLICY agent_ops_security_attempts_org_select ON agent_ops_security_attempts
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_security_attempts_service_all ON agent_ops_security_attempts;

CREATE POLICY agent_ops_security_attempts_service_all ON agent_ops_security_attempts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
