-- Pulse: Distributed Agent Orchestration Engine
-- Phase 3: agent_runs ledger + next_wake_at index

-- Agent runs ledger (centralized cross-event-type run state)
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('inbound', 'outbound', 'scheduled')),
  event_id UUID NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'running', 'completed', 'failed', 'dlq')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'normal', 'background')),
  attempt INTEGER NOT NULL DEFAULT 1,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_active ON agent_runs(status) WHERE status IN ('claimed', 'running');
CREATE INDEX IF NOT EXISTS idx_agent_runs_org ON agent_runs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_event ON agent_runs(event_id, event_type);

-- Add next_wake_at to agents for Pulse wake scanner
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_assistants' AND column_name = 'next_wake_at'
  ) THEN
    ALTER TABLE ai_assistants ADD COLUMN next_wake_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assistants_next_wake
  ON ai_assistants(next_wake_at)
  WHERE next_wake_at IS NOT NULL AND deleted_at IS NULL;

-- RLS for agent_runs (org-scoped via organization_members)
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view agent runs"
  ON agent_runs FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything (worker uses service role key)
CREATE POLICY "service role full access to agent runs"
  ON agent_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
