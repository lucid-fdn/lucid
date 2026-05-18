-- Linear Agent Sessions — Phase 1 Foundation
--
-- Maps Linear Agents API sessions 1:1 to agent runs. Tracks:
--   - Linear session ID, issue details, trigger type
--   - Run linkage (agent_id, run_id, pulse_job_run_id)
--   - Lifecycle timing (webhook received → thought emitted → run started → completed)
--   - Status state machine (pending → active → complete | error | cancelled)
--
-- Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 1

CREATE TABLE linear_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  linear_session_id TEXT NOT NULL,
  linear_issue_id TEXT NOT NULL,
  linear_issue_identifier TEXT,
  linear_issue_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','awaiting_input','complete','error','stale','cancelled')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('assignment','mention','comment')),
  run_id TEXT,
  pulse_job_run_id TEXT,
  linear_actor_id TEXT,
  linear_actor_name TEXT,
  signal TEXT,
  webhook_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  thought_emitted_at TIMESTAMPTZ,
  run_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_linear_sessions_linear_id ON linear_agent_sessions(linear_session_id);
CREATE INDEX idx_linear_sessions_org_status ON linear_agent_sessions(org_id, status, created_at DESC);
CREATE INDEX idx_linear_sessions_issue ON linear_agent_sessions(linear_issue_id);

-- RLS: org-scoped via organization_members
ALTER TABLE linear_agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY linear_agent_sessions_select ON linear_agent_sessions
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY linear_agent_sessions_service ON linear_agent_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_linear_agent_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_linear_agent_sessions_updated_at
  BEFORE UPDATE ON linear_agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_linear_agent_sessions_updated_at();
