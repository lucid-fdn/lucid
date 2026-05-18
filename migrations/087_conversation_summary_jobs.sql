-- Migration 087: Conversation Summary Jobs
-- Durable async job queue for conversation summary generation.
-- Follows the same outbox/claim pattern as agent_scheduled_tasks (082).

CREATE TABLE IF NOT EXISTS conversation_summary_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- State machine: pending -> claimed -> completed | failed | dead_letter | discarded
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'completed', 'failed', 'dead_letter', 'discarded')),
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,

  -- Input context
  message_count INTEGER NOT NULL,           -- messages at enqueue time
  last_message_id TEXT,                     -- detect staleness

  -- Execution tracking
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Claim index: only pending/failed jobs, ordered by creation
CREATE INDEX IF NOT EXISTS idx_summary_jobs_claimable
  ON conversation_summary_jobs(created_at ASC)
  WHERE status IN ('pending', 'failed');

-- Dedup: only one active job per conversation (pending or claimed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_jobs_dedup
  ON conversation_summary_jobs(conversation_id)
  WHERE status IN ('pending', 'claimed');

ALTER TABLE conversation_summary_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON conversation_summary_jobs FOR ALL
  USING (true) WITH CHECK (true);

-- Claim function: FOR UPDATE SKIP LOCKED (same pattern as scheduled tasks)
CREATE OR REPLACE FUNCTION claim_next_summary_job(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 5
)
RETURNS SETOF conversation_summary_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE conversation_summary_jobs
  SET
    status = 'claimed',
    claimed_by = p_worker_id,
    claimed_at = now()
  WHERE id IN (
    SELECT id FROM conversation_summary_jobs
    WHERE status IN ('pending', 'failed')
      AND (retry_count < max_retries OR status = 'pending')
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

-- Reset stuck jobs (claimed but not completed within timeout)
CREATE OR REPLACE FUNCTION reset_stuck_summary_jobs(
  p_timeout_minutes INTEGER DEFAULT 5
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  UPDATE conversation_summary_jobs
  SET status = 'pending', claimed_by = NULL, claimed_at = NULL
  WHERE status = 'claimed'
    AND claimed_at < now() - (p_timeout_minutes || ' minutes')::interval;
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;
