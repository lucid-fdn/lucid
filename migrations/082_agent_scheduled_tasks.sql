-- Migration 082: Agent Scheduled Tasks
-- Cron-like scheduling for AI agent runs (outbox pattern).
-- Aligned with OpenClaw CronService semantics but backed by Supabase.

CREATE TABLE IF NOT EXISTS agent_scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  -- Loose association — no FK constraint to avoid dependency on conversation lifecycle
  conversation_id UUID,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Schedule definition
  name TEXT NOT NULL,
  description TEXT,
  task_prompt TEXT NOT NULL,
  cron_expression TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  run_at TIMESTAMPTZ,

  -- State machine: pending -> claimed -> running -> completed | failed | dead_letter
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'running', 'completed', 'failed', 'dead_letter', 'cancelled')),
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,

  -- Execution tracking
  last_run_at TIMESTAMPTZ,
  last_run_id UUID,
  last_error TEXT,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,

  -- Idempotency
  idempotency_key TEXT,

  -- Origin tracking
  parent_run_id UUID,
  origin_tool_call_id TEXT,

  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_tasks_next_run
  ON agent_scheduled_tasks(next_run_at)
  WHERE enabled = true AND status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_tasks_assistant
  ON agent_scheduled_tasks(assistant_id);

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_tasks_org
  ON agent_scheduled_tasks(org_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_scheduled_tasks_idempotency
  ON agent_scheduled_tasks(assistant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE agent_scheduled_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON agent_scheduled_tasks FOR ALL
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION claim_next_scheduled_task(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 1
)
RETURNS SETOF agent_scheduled_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  UPDATE agent_scheduled_tasks
  SET
    status = 'claimed',
    claimed_by = p_worker_id,
    claimed_at = now()
  WHERE id IN (
    SELECT id FROM agent_scheduled_tasks
    WHERE enabled = true
      AND status IN ('pending', 'failed')
      AND next_run_at <= now()
      AND (retry_count < max_retries OR status = 'pending')
    ORDER BY next_run_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION reset_stuck_scheduled_tasks(
  p_timeout_minutes INTEGER DEFAULT 10
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  UPDATE agent_scheduled_tasks
  SET status = 'pending', claimed_by = NULL, claimed_at = NULL
  WHERE status IN ('claimed', 'running')
    AND claimed_at < now() - (p_timeout_minutes || ' minutes')::interval;
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;
