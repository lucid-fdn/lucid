-- Add p_runtime_id param to claim_next_outbound_event
-- Worker passes this param but DB function only had p_worker_id + p_batch_size.
-- When p_runtime_id is provided, only claim events for agents assigned to that runtime.
-- NULL = shared worker, claims all unassigned events (backwards compat).

CREATE OR REPLACE FUNCTION claim_next_outbound_event(
  p_worker_id   TEXT,
  p_batch_size  INTEGER DEFAULT 1,
  p_runtime_id  TEXT DEFAULT NULL
)
RETURNS SETOF assistant_outbound_events
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE assistant_outbound_events
  SET
    status       = 'processing',
    locked_at    = NOW(),
    locked_by    = p_worker_id,
    locked_until = NOW() + INTERVAL '15 minutes',
    attempts     = attempts + 1
  WHERE id IN (
    SELECT oe.id
    FROM assistant_outbound_events oe
    WHERE oe.status = 'pending'
      AND (oe.next_attempt_at IS NULL OR oe.next_attempt_at <= NOW())
      AND oe.attempts < oe.max_attempts
      AND (
        p_runtime_id IS NULL
        OR EXISTS (
          SELECT 1 FROM ai_assistants a
          WHERE a.id = oe.assistant_id
            AND a.runtime_id::TEXT = p_runtime_id
        )
      )
    ORDER BY oe.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_next_outbound_event TO service_role;
