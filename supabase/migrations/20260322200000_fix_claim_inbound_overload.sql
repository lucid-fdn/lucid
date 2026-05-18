-- ============================================================================
-- FIX: claim_next_inbound_event overload ambiguity
--
-- Migration 089 created a second overload of claim_next_inbound_event with
-- 3 parameters (p_worker_id, p_batch_size, p_lease_minutes) alongside the
-- original 2-parameter version from migration 044. PostgreSQL cannot
-- disambiguate when called with 2 args because both signatures match
-- (the 3rd parameter has a default).
--
-- Error: "Could not choose the best candidate function between:
--   claim_next_inbound_event(p_worker_id => text, p_batch_size => integer),
--   claim_next_inbound_event(p_worker_id => text, p_batch_size => integer, p_lease_minutes => integer)"
--
-- Fix: Drop BOTH overloads explicitly, then recreate the singular alias
-- that delegates to claim_next_inbound_events (plural) and returns
-- SETOF assistant_inbound_events (full rows), which is what the worker expects.
-- ============================================================================

-- ─── Ensure assistant_chat_locks exists (may not exist in self-hosted) ───
CREATE TABLE IF NOT EXISTS assistant_chat_locks (
  channel_id UUID NOT NULL,
  external_chat_id TEXT NOT NULL,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, external_chat_id)
);

-- Drop the old 2-param version (migration 044)
DROP FUNCTION IF EXISTS claim_next_inbound_event(TEXT, INTEGER);

-- Drop the new 3-param version (migration 089)
DROP FUNCTION IF EXISTS claim_next_inbound_event(TEXT, INTEGER, INTEGER);

-- Recreate singular alias that delegates to the plural version.
-- Returns SETOF assistant_inbound_events (full row) so the worker gets
-- all columns it needs (id, channel_id, external_message_id, external_user_id,
-- external_chat_id, message_text, message_data, attempts, max_attempts, etc.)
CREATE OR REPLACE FUNCTION claim_next_inbound_event(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10
)
RETURNS SETOF assistant_inbound_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease_minutes INTEGER := 5;
  v_lease_expires_at TIMESTAMPTZ;
BEGIN
  v_lease_expires_at := NOW() + (v_lease_minutes || ' minutes')::INTERVAL;

  RETURN QUERY
  WITH available_chats AS (
    SELECT DISTINCT ON (e.channel_id, e.external_chat_id)
      e.channel_id,
      e.external_chat_id
    FROM assistant_inbound_events e
    JOIN assistant_channels ac ON ac.id = e.channel_id
    JOIN ai_assistants aa ON aa.id = ac.assistant_id
    LEFT JOIN assistant_chat_locks l
      ON l.channel_id = e.channel_id
      AND l.external_chat_id = e.external_chat_id
    WHERE (
        e.status = 'pending'
        OR (e.status = 'processing' AND (e.locked_until < NOW() OR e.lease_expires_at < NOW()))
        OR (e.status = 'failed' AND e.next_attempt_at <= NOW() AND e.attempts < e.max_attempts)
      )
      AND (l.locked_until IS NULL OR l.locked_until < NOW())
      -- Mission Control: skip paused agents
      AND COALESCE(aa.mc_status, 'active') != 'paused'
      AND aa.deleted_at IS NULL
    ORDER BY e.channel_id, e.external_chat_id, e.created_at ASC
    LIMIT p_batch_size
  ),
  locked_chats AS (
    INSERT INTO assistant_chat_locks (channel_id, external_chat_id, locked_until, locked_by, updated_at)
    SELECT ac.channel_id, ac.external_chat_id, v_lease_expires_at, p_worker_id, NOW()
    FROM available_chats ac
    ON CONFLICT (channel_id, external_chat_id) DO UPDATE
      SET locked_until = v_lease_expires_at,
          locked_by = p_worker_id,
          updated_at = NOW()
    RETURNING channel_id, external_chat_id
  ),
  claimed AS (
    UPDATE assistant_inbound_events ie
    SET
      status = 'processing',
      locked_by = p_worker_id,
      locked_at = NOW(),
      locked_until = v_lease_expires_at,
      lease_expires_at = v_lease_expires_at,
      attempts = ie.attempts + 1
    FROM locked_chats lc
    WHERE ie.channel_id = lc.channel_id
      AND ie.external_chat_id = lc.external_chat_id
      AND (
        ie.status = 'pending'
        OR (ie.status = 'processing' AND (ie.locked_until < NOW()))
        OR (ie.status = 'failed' AND ie.next_attempt_at <= NOW() AND ie.attempts < ie.max_attempts)
      )
    RETURNING ie.*
  )
  SELECT * FROM claimed;
END;
$$;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION claim_next_inbound_event(TEXT, INTEGER) TO service_role;
