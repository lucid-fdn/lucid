-- Migration 089: Mission Control Phase 1 — Approvals + Controls
-- Tables: mc_pending_approvals, mc_approval_log
-- Columns: ai_assistants.approval_required_tools, ai_assistants.status
-- View: mc_feed_events_v (canonical event stream over existing tables)

-- ─── New columns on ai_assistants ───

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS approval_required_tools TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mc_status TEXT NOT NULL DEFAULT 'active'
    CHECK (mc_status IN ('active', 'paused'));

COMMENT ON COLUMN ai_assistants.approval_required_tools IS 'Tools requiring owner approval before execution';
COMMENT ON COLUMN ai_assistants.mc_status IS 'Mission Control status: active or paused';

CREATE INDEX IF NOT EXISTS idx_ai_assistants_mc_status
  ON ai_assistants (org_id, mc_status) WHERE deleted_at IS NULL;

-- ─── mc_pending_approvals ───

CREATE TABLE IF NOT EXISTS mc_pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_args JSONB NOT NULL DEFAULT '{}',
  estimated_cost_usd NUMERIC(10,4),
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mc_pending_approvals_org_status
  ON mc_pending_approvals (org_id, status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_mc_pending_approvals_agent
  ON mc_pending_approvals (agent_id, status);

ALTER TABLE mc_pending_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's approvals"
  ON mc_pending_approvals FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their org's approvals"
  ON mc_pending_approvals FOR UPDATE
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- ─── mc_approval_log ───

CREATE TABLE IF NOT EXISTS mc_approval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES mc_pending_approvals(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('approved', 'denied', 'expired', 'auto_denied')),
  resolved_by UUID REFERENCES profiles(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mc_approval_log_org
  ON mc_approval_log (org_id, created_at DESC);

ALTER TABLE mc_approval_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's approval log"
  ON mc_approval_log FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- ─── mc_feed_events_v: canonical event stream ───
-- Union of inbound + outbound events, normalized for live feed consumption.
-- No new table — reads from existing assistant_inbound_events and assistant_outbound_events.

CREATE OR REPLACE VIEW mc_feed_events_v AS
-- Inbound messages (message_received)
SELECT
  ie.id,
  'message_received'::TEXT AS event_type,
  'info'::TEXT AS severity,
  aa.id AS agent_id,
  aa.name AS agent_name,
  aa.org_id,
  NULL::TEXT AS run_id,
  jsonb_build_object(
    'message_text', LEFT(ie.message_text, 200),
    'channel_type', ac.channel_type,
    'external_user_id', ie.external_user_id,
    'status', ie.status
  ) AS payload,
  ie.created_at
FROM assistant_inbound_events ie
JOIN assistant_channels ac ON ac.id = ie.channel_id
JOIN ai_assistants aa ON aa.id = ac.assistant_id
WHERE aa.deleted_at IS NULL

UNION ALL

-- Outbound messages (message_sent)
SELECT
  oe.id,
  CASE
    WHEN oe.status = 'failed' THEN 'error'
    ELSE 'message_sent'
  END::TEXT AS event_type,
  CASE
    WHEN oe.status = 'failed' THEN 'error'
    ELSE 'info'
  END::TEXT AS severity,
  aa.id AS agent_id,
  aa.name AS agent_name,
  aa.org_id,
  NULL::TEXT AS run_id,
  jsonb_build_object(
    'message_text', LEFT(oe.message_text, 200),
    'channel_type', ac.channel_type,
    'status', oe.status,
    'last_error', oe.last_error
  ) AS payload,
  oe.created_at
FROM assistant_outbound_events oe
JOIN assistant_channels ac ON ac.id = oe.channel_id
JOIN ai_assistants aa ON aa.id = ac.assistant_id
WHERE aa.deleted_at IS NULL;

-- ─── RPCs ───

-- mc_agent_list: returns agents with status, cost, error info for an org
CREATE OR REPLACE FUNCTION mc_agent_list(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  mc_status TEXT,
  lucid_model TEXT,
  is_active BOOLEAN,
  org_id UUID,
  approval_required_tools TEXT[],
  last_active_at TIMESTAMPTZ,
  errors_last_hour BIGINT,
  pending_approvals BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.name,
    a.description,
    a.mc_status,
    a.lucid_model,
    a.is_active,
    a.org_id,
    a.approval_required_tools,
    (
      SELECT MAX(ie.created_at)
      FROM assistant_inbound_events ie
      JOIN assistant_channels ac ON ac.id = ie.channel_id
      WHERE ac.assistant_id = a.id
    ) AS last_active_at,
    (
      SELECT COUNT(*)
      FROM assistant_outbound_events oe
      JOIN assistant_channels ac ON ac.id = oe.channel_id
      WHERE ac.assistant_id = a.id
        AND oe.status = 'failed'
        AND oe.created_at > now() - INTERVAL '1 hour'
    ) AS errors_last_hour,
    (
      SELECT COUNT(*)
      FROM mc_pending_approvals pa
      WHERE pa.agent_id = a.id AND pa.status = 'pending'
    ) AS pending_approvals
  FROM ai_assistants a
  WHERE a.org_id = p_org_id
    AND a.deleted_at IS NULL
  ORDER BY a.mc_status DESC, a.name ASC;
$$;

-- mc_feed_events: returns recent feed events for an org
CREATE OR REPLACE FUNCTION mc_feed_events(
  p_org_id UUID,
  p_limit INT DEFAULT 50,
  p_agent_id UUID DEFAULT NULL,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  severity TEXT,
  agent_id UUID,
  agent_name TEXT,
  org_id UUID,
  run_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM mc_feed_events_v v
  WHERE v.org_id = p_org_id
    AND (p_agent_id IS NULL OR v.agent_id = p_agent_id)
    AND (p_cursor IS NULL OR v.created_at < p_cursor)
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;

-- mc_agent_context: returns detailed context for a single agent
CREATE OR REPLACE FUNCTION mc_agent_context(p_agent_id UUID, p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'agent', row_to_json(a.*),
    'channels', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', ac.id,
        'channel_type', ac.channel_type,
        'is_active', ac.is_active
      )), '[]'::json)
      FROM assistant_channels ac
      WHERE ac.assistant_id = a.id AND ac.is_active = true
    ),
    'recent_memories', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', m.id,
        'content', LEFT(m.content, 200),
        'category', m.category,
        'importance', m.importance
      ) ORDER BY m.last_accessed_at DESC), '[]'::json)
      FROM (
        SELECT * FROM assistant_memory
        WHERE assistant_id = a.id
        ORDER BY last_accessed_at DESC NULLS LAST
        LIMIT 5
      ) m
    ),
    'pending_approvals_count', (
      SELECT COUNT(*)
      FROM mc_pending_approvals pa
      WHERE pa.agent_id = a.id AND pa.status = 'pending'
    ),
    'last_error', (
      SELECT oe.last_error
      FROM assistant_outbound_events oe
      JOIN assistant_channels ac ON ac.id = oe.channel_id
      WHERE ac.assistant_id = a.id AND oe.status = 'failed'
      ORDER BY oe.created_at DESC
      LIMIT 1
    )
  ) INTO result
  FROM ai_assistants a
  WHERE a.id = p_agent_id
    AND a.org_id = p_org_id
    AND a.deleted_at IS NULL;

  RETURN result;
END;
$$;

-- ─── Ensure assistant_chat_locks exists (may not exist in self-hosted) ───
-- The claim functions below reference this table for conversation-level locking.
-- In self-hosted mode, the bootstrap schema creates assistant_conversation_locks
-- (the newer version), but not assistant_chat_locks. Create it if missing so the
-- functions below can reference it.
CREATE TABLE IF NOT EXISTS assistant_chat_locks (
  channel_id UUID NOT NULL,
  external_chat_id TEXT NOT NULL,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, external_chat_id)
);

-- ─── Paused agent filter for claim_next_inbound_events ───
-- The existing claim_next_inbound_events RPC joins assistant_channels → ai_assistants.
-- We add a WHERE filter so paused agents' events stay pending (not claimed).
-- This is a DROP + RECREATE of the function with the mc_status filter added.
-- NOTE: The full function body is copied from migration 047 with one additional line.

CREATE OR REPLACE FUNCTION claim_next_inbound_events(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10,
  p_lease_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  event_id UUID,
  channel_id UUID,
  assistant_id UUID,
  external_chat_id TEXT,
  message_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_lease_expires_at TIMESTAMPTZ;
BEGIN
  v_lease_expires_at := NOW() + (p_lease_minutes || ' minutes')::INTERVAL;

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
      attempts = ie.attempts + 1
    FROM locked_chats lc
    WHERE ie.channel_id = lc.channel_id
      AND ie.external_chat_id = lc.external_chat_id
      AND (
        ie.status = 'pending'
        OR (ie.status = 'processing' AND (ie.locked_until < NOW()))
        OR (ie.status = 'failed' AND ie.next_attempt_at <= NOW() AND ie.attempts < ie.max_attempts)
      )
    RETURNING ie.id AS event_id, ie.channel_id, ie.external_chat_id, ie.message_text
  )
  SELECT
    c.event_id,
    c.channel_id,
    ac.assistant_id,
    c.external_chat_id,
    c.message_text
  FROM claimed c
  JOIN assistant_channels ac ON ac.id = c.channel_id;
END;
$$;

-- Also create the singular version alias that may be called
CREATE OR REPLACE FUNCTION claim_next_inbound_event(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10,
  p_lease_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  event_id UUID,
  channel_id UUID,
  assistant_id UUID,
  external_chat_id TEXT,
  message_text TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM claim_next_inbound_events(p_worker_id, p_batch_size, p_lease_minutes);
$$;
