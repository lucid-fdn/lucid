-- A1: Add p_runtime_id filter to claim_next_inbound_event
-- Bug: Both shared and dedicated workers claim from the same pool.
-- Fix: Filter by runtime_id so dedicated workers only claim their agents' events,
--      and shared workers only claim events for agents with no runtime assigned.

-- 1. Replace the RPC with runtime-aware version
CREATE OR REPLACE FUNCTION public.claim_next_inbound_event(
  p_worker_id TEXT,
  p_batch_size INT DEFAULT 10,
  p_runtime_id TEXT DEFAULT NULL
)
RETURNS SETOF assistant_inbound_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_ids UUID[];
BEGIN
  -- Claim a batch of events, respecting conversation locking, mc_status, and runtime assignment
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
      -- Runtime filter: dedicated workers claim only their agents, shared workers claim unassigned agents
      AND (
        (p_runtime_id IS NULL AND aa.runtime_id IS NULL)
        OR (aa.runtime_id::text = p_runtime_id)
      )
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

-- 2. Index on ai_assistants.runtime_id for mc_agent_fleet RPC (joins every 10s)
CREATE INDEX IF NOT EXISTS idx_ai_assistants_runtime_id
  ON ai_assistants(runtime_id)
  WHERE deleted_at IS NULL;
