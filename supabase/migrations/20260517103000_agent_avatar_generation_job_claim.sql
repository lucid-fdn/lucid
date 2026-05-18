ALTER TABLE public.agent_avatar_generation_jobs
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS agent_avatar_generation_jobs_claim
  ON public.agent_avatar_generation_jobs (status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'running');

CREATE OR REPLACE FUNCTION public.claim_next_agent_avatar_generation_jobs(
  p_worker_id TEXT,
  p_limit INT DEFAULT 1,
  p_stale_after_seconds INT DEFAULT 900
)
RETURNS SETOF public.agent_avatar_generation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.agent_avatar_generation_jobs j
    WHERE (
      j.status = 'queued'
      AND j.attempts < j.max_attempts
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= NOW())
    )
    OR (
      j.status = 'running'
      AND j.attempts < j.max_attempts
      AND j.locked_at < NOW() - make_interval(secs => p_stale_after_seconds)
    )
    ORDER BY j.created_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 10))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.agent_avatar_generation_jobs j
  SET
    status = 'running',
    locked_by = p_worker_id,
    locked_at = NOW(),
    started_at = COALESCE(j.started_at, NOW()),
    attempts = j.attempts + 1,
    error_code = NULL,
    error_message = NULL,
    updated_at = NOW()
  FROM candidates
  WHERE j.id = candidates.id
  RETURNING j.*;
END;
$$;

COMMENT ON FUNCTION public.claim_next_agent_avatar_generation_jobs(TEXT, INT, INT) IS
  'Atomically claims queued/stale agent avatar generation jobs for worker processing.';
