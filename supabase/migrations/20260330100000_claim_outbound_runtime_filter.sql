-- Phase 1a: Add p_runtime_id filter to claim_next_outbound_event
-- Bug: claim_next_outbound_event has NO runtime_id filter. A dedicated worker can
-- claim outbound events for agents on other runtimes.
-- Fix: Pattern-matches 20260326300000_claim_inbound_runtime_filter.sql.
-- Backward-compatible: p_runtime_id DEFAULT NULL preserves existing shared worker behavior.

CREATE OR REPLACE FUNCTION claim_next_outbound_event(
  p_worker_id TEXT,
  p_batch_size INT DEFAULT 20,
  p_runtime_id TEXT DEFAULT NULL
)
RETURNS SETOF assistant_outbound_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT oe.id
    FROM assistant_outbound_events oe
    JOIN assistant_channels ac ON ac.id = oe.channel_id
    JOIN ai_assistants aa ON aa.id = ac.assistant_id
    WHERE oe.status IN ('pending', 'failed')
      AND (oe.locked_until IS NULL OR oe.locked_until < NOW())
      AND oe.attempts < oe.max_attempts
      AND (oe.next_attempt_at IS NULL OR oe.next_attempt_at <= NOW())
      AND aa.deleted_at IS NULL
      -- Runtime filter: dedicated workers claim only their agents, shared workers claim unassigned
      AND (
        (p_runtime_id IS NULL AND aa.runtime_id IS NULL)
        OR (aa.runtime_id::text = p_runtime_id)
      )
    ORDER BY oe.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE OF oe SKIP LOCKED
  )
  UPDATE assistant_outbound_events oe
  SET status = 'processing',
      locked_by = p_worker_id,
      locked_at = NOW(),
      locked_until = NOW() + INTERVAL '5 minutes'
  FROM claimable
  WHERE oe.id = claimable.id
  RETURNING oe.*;
END;
$$;

-- Indexes for efficient JOIN path
CREATE INDEX IF NOT EXISTS idx_outbound_channel_status
  ON assistant_outbound_events(channel_id, status)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_channels_assistant_id
  ON assistant_channels(assistant_id);

-- Runtime index already exists from 20260326300000 but add for outbound path clarity
CREATE INDEX IF NOT EXISTS idx_assistants_runtime_id_outbound
  ON ai_assistants(runtime_id)
  WHERE runtime_id IS NOT NULL;
