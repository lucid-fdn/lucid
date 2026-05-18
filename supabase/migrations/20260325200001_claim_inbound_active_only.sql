-- Migration: Update claim_next_inbound_event to only process active agents
-- Previously: != 'paused' (allowed stopped/failed agents to claim)
-- Now: = 'active' (only active agents can claim inbound events)

CREATE OR REPLACE FUNCTION public.claim_next_inbound_event(
  p_worker_id TEXT,
  p_batch_size INT DEFAULT 10
)
RETURNS SETOF assistant_inbound_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_ids UUID[];
BEGIN
  -- Claim a batch of events, respecting conversation locking and mc_status
  WITH claimable AS (
    SELECT e.id
    FROM assistant_inbound_events e
    JOIN ai_assistants aa ON aa.id = e.assistant_id
    LEFT JOIN assistant_conversation_locks l
      ON l.assistant_id = e.assistant_id
      AND l.channel_id = e.channel_id
      AND l.external_chat_id = e.external_chat_id
    WHERE (
        e.status = 'pending'
        OR (e.status = 'failed' AND e.next_attempt_at <= NOW() AND e.attempts < e.max_attempts)
      )
      AND (l.locked_until IS NULL OR l.locked_until < NOW())
      -- Mission Control: only process active agents (skip paused, stopped, failed)
      AND COALESCE(aa.mc_status, 'active') = 'active'
      AND aa.deleted_at IS NULL
    ORDER BY e.channel_id, e.external_chat_id, e.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE OF e SKIP LOCKED
  )
  UPDATE assistant_inbound_events
  SET status = 'claimed',
      claimed_by = p_worker_id,
      claimed_at = NOW()
  WHERE id IN (SELECT id FROM claimable)
  RETURNING id INTO v_claimed_ids;

  -- Return the claimed events
  RETURN QUERY
  SELECT * FROM assistant_inbound_events
  WHERE id = ANY(v_claimed_ids);
END;
$$;
