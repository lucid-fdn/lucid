-- Phase 3N: Step Execution Protocol — orchestration_steps table
-- Tracks individual steps within Pulse runs for webhook callbacks,
-- approval gates, and future DAG execution (Phase 4N).

CREATE TABLE orchestration_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  event_id UUID NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  parent_step_id UUID REFERENCES orchestration_steps(id),
  step_type TEXT NOT NULL CHECK (step_type IN ('inbound', 'outbound', 'scheduled', 'webhook', 'approval')),
  executor_type TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'running', 'completed', 'failed', 'cancelled')),

  -- Webhook-specific
  webhook_url TEXT,
  callback_status TEXT CHECK (callback_status IN ('pending', 'received')),
  -- NOTE: callback_token is NOT stored. Recomputed from stepId + runId + PULSE_WEBHOOK_SECRET.

  -- Approval-specific
  approval_id UUID,

  -- Execution metadata
  input JSONB CHECK (octet_length(input::text) <= 102400),
  output TEXT CHECK (octet_length(output) <= 102400),
  error_message TEXT,
  duration_ms INTEGER,
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ
);

-- Idempotency: one step per event+attempt+step_type
CREATE UNIQUE INDEX idx_orch_steps_idempotent ON orchestration_steps(event_id, attempt, step_type);
CREATE INDEX idx_orch_steps_run ON orchestration_steps(run_id);
CREATE INDEX idx_orch_steps_agent ON orchestration_steps(agent_id, created_at DESC);
CREATE INDEX idx_orch_steps_active ON orchestration_steps(status) WHERE status IN ('pending', 'claimed', 'running');
CREATE INDEX idx_orch_steps_callback ON orchestration_steps(id) WHERE callback_status = 'pending';

-- RLS (same pattern as agent_runs)
ALTER TABLE orchestration_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read" ON orchestration_steps FOR SELECT
  USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "service_write" ON orchestration_steps FOR ALL
  USING (auth.role() = 'service_role');
