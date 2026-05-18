-- Durable Memory Extraction Jobs
-- Keeps inbound latency low while making memory extraction retryable,
-- idempotent, and visible to Mission Control/operator tooling.

CREATE TABLE IF NOT EXISTS memory_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,

  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  inbound_event_id UUID NOT NULL,
  run_id TEXT NOT NULL,

  channel_type TEXT NOT NULL,
  channel_id UUID NOT NULL,
  external_message_id TEXT,
  conversation_message_count INTEGER NOT NULL DEFAULT 0,
  encryption_mode TEXT NOT NULL DEFAULT 'NONE',

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'completed', 'failed', 'dead_letter', 'discarded')),
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_extraction_jobs_claimable
  ON memory_extraction_jobs(next_attempt_at ASC, created_at ASC)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_memory_extraction_jobs_assistant_created
  ON memory_extraction_jobs(assistant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_extraction_jobs_org_created
  ON memory_extraction_jobs(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_extraction_jobs_conversation_created
  ON memory_extraction_jobs(conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION touch_memory_extraction_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memory_extraction_jobs_updated_at ON memory_extraction_jobs;
CREATE TRIGGER trg_memory_extraction_jobs_updated_at
  BEFORE UPDATE ON memory_extraction_jobs
  FOR EACH ROW
  EXECUTE FUNCTION touch_memory_extraction_jobs_updated_at();

ALTER TABLE memory_extraction_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON memory_extraction_jobs;
CREATE POLICY "Service role full access"
  ON memory_extraction_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION claim_next_memory_extraction_job(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 5
)
RETURNS SETOF memory_extraction_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE memory_extraction_jobs
  SET
    status = 'claimed',
    claimed_by = p_worker_id,
    claimed_at = now()
  WHERE id IN (
    SELECT id
    FROM memory_extraction_jobs
    WHERE status IN ('pending', 'failed')
      AND retry_count < max_retries
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION reset_stuck_memory_extraction_jobs(
  p_timeout_minutes INTEGER DEFAULT 10
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  UPDATE memory_extraction_jobs
  SET
    status = 'pending',
    claimed_by = NULL,
    claimed_at = NULL,
    next_attempt_at = now()
  WHERE status = 'claimed'
    AND claimed_at < now() - (p_timeout_minutes || ' minutes')::interval;

  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;
