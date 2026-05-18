-- Hotfix: claim_next_inbound_event references claimed_by/claimed_at columns
-- that don't exist on assistant_inbound_events. The table uses locked_by/locked_at/locked_until.
-- Also uses status='claimed' which isn't in the CHECK constraint.
-- Fix: revert to existing column semantics (locked_by, locked_at, status='processing').

-- First drop the old 2-param overload (if still exists from previous hotfix)
DROP FUNCTION IF EXISTS public.claim_next_inbound_event(TEXT, INT);

-- Replace with corrected 3-param version using existing columns
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
BEGIN
  RETURN QUERY
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
      -- Mission Control: only process active agents
      AND COALESCE(aa.mc_status, 'active') = 'active'
      AND aa.deleted_at IS NULL
      -- Runtime filter: dedicated workers claim only their agents, shared workers claim unassigned
      AND (
        (p_runtime_id IS NULL AND aa.runtime_id IS NULL)
        OR (aa.runtime_id::text = p_runtime_id)
      )
    ORDER BY e.channel_id, e.external_chat_id, e.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE OF e SKIP LOCKED
  )
  UPDATE assistant_inbound_events
  SET status = 'processing',
      locked_by = p_worker_id,
      locked_at = NOW(),
      locked_until = NOW() + INTERVAL '15 minutes',
      attempts = attempts + 1
  WHERE id IN (SELECT id FROM claimable)
  RETURNING *;
END;
$$;
