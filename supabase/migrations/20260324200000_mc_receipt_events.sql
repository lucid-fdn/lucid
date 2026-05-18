-- ============================================================================
-- mc_receipt_events: L2 receipt pipeline events for live feed
-- ============================================================================
-- Tracks receipt creation (worker), verification (user), and passport
-- provisioning events. Surfaced in Mission Control live feed via
-- mc_feed_events_v view.
--
-- Follows MC table patterns: agent_id FK, org_id FK, RLS org-scoped,
-- Realtime publication, retention comment.

-- ── 1. Create table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mc_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('receipt_created', 'receipt_verified', 'passport_provisioned')),
  run_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mc_receipt_events IS 'L2 receipt pipeline events (receipt creation, verification, passport provisioning). 90-day retention (application-level cleanup).';

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mc_receipt_events_agent_created
  ON mc_receipt_events(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_receipt_events_org_created
  ON mc_receipt_events(org_id, created_at DESC);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE mc_receipt_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their org receipt events"
    ON mc_receipt_events FOR SELECT
    USING (
      org_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Workers can insert receipt events"
    ON mc_receipt_events FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. Add to Realtime publication ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mc_receipt_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_receipt_events;
  END IF;
END $$;

-- ── 5. Extend the feed view with 8th UNION ──────────────────────────────────
-- Wrapped in DO block: trading_transactions may not exist in self-hosted mode.

DO $$
DECLARE
  v_trading_branch TEXT := '';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trading_transactions') THEN
    v_trading_branch := '
UNION ALL
SELECT
  tt.id,
  CASE
    WHEN tt.status = ''confirmed'' THEN ''transaction_confirmed''
    WHEN tt.status = ''failed''    THEN ''transaction_failed''
    ELSE ''transaction_submitted''
  END::TEXT AS event_type,
  CASE
    WHEN tt.status = ''failed'' THEN ''error''
    WHEN tt.status = ''confirmed'' THEN ''info''
    ELSE ''warn''
  END::TEXT AS severity,
  aa.id AS agent_id,
  aa.name AS agent_name,
  aa.org_id,
  tt.run_id,
  jsonb_build_object(
    ''tx_type'', tt.tx_type,
    ''tx_hash'', tt.tx_hash,
    ''chain_type'', tt.chain_type,
    ''chain_id'', tt.chain_id,
    ''status'', tt.status,
    ''input_token'', tt.input_token,
    ''input_amount'', tt.input_amount,
    ''output_token'', tt.output_token,
    ''output_amount'', tt.output_amount,
    ''value_usd'', tt.value_usd,
    ''dex_used'', tt.dex_used,
    ''error_message'', tt.error_message,
    ''recipient_address'', tt.recipient_address,
    ''perp_market'', tt.perp_market,
    ''perp_side'', tt.perp_side
  ) AS payload,
  tt.created_at
FROM trading_transactions tt
JOIN ai_assistants aa ON aa.id = tt.assistant_id
WHERE aa.deleted_at IS NULL
  AND tt.status IN (''submitted'', ''confirmed'', ''failed'')';
  END IF;

  EXECUTE format('
CREATE OR REPLACE VIEW mc_feed_events_v AS

SELECT
  ie.id,
  ''message_received''::TEXT AS event_type,
  ''info''::TEXT AS severity,
  aa.id AS agent_id,
  aa.name AS agent_name,
  aa.org_id,
  NULL::TEXT AS run_id,
  jsonb_build_object(
    ''message_text'', LEFT(ie.message_text, 200),
    ''channel_type'', ac.channel_type,
    ''external_user_id'', ie.external_user_id,
    ''status'', ie.status
  ) AS payload,
  ie.created_at
FROM assistant_inbound_events ie
JOIN assistant_channels ac ON ac.id = ie.channel_id
JOIN ai_assistants aa ON aa.id = ac.assistant_id
WHERE aa.deleted_at IS NULL

UNION ALL

SELECT
  oe.id,
  CASE
    WHEN oe.status = ''failed'' THEN ''error''
    ELSE ''message_sent''
  END::TEXT AS event_type,
  CASE
    WHEN oe.status = ''failed'' THEN ''error''
    ELSE ''info''
  END::TEXT AS severity,
  aa.id AS agent_id,
  aa.name AS agent_name,
  aa.org_id,
  NULL::TEXT AS run_id,
  jsonb_build_object(
    ''message_text'', LEFT(oe.message_text, 200),
    ''channel_type'', ac.channel_type,
    ''status'', oe.status,
    ''last_error'', oe.last_error
  ) AS payload,
  oe.created_at
FROM assistant_outbound_events oe
JOIN assistant_channels ac ON ac.id = oe.channel_id
JOIN ai_assistants aa ON aa.id = ac.assistant_id
WHERE aa.deleted_at IS NULL

%s

UNION ALL

SELECT
  pa.id,
  ''approval_requested''::TEXT AS event_type,
  CASE
    WHEN pa.risk_level = ''critical'' THEN ''critical''
    WHEN pa.risk_level = ''high''     THEN ''error''
    WHEN pa.risk_level = ''medium''   THEN ''warn''
    ELSE ''info''
  END::TEXT AS severity,
  pa.agent_id,
  aa.name AS agent_name,
  pa.org_id,
  pa.run_id,
  jsonb_build_object(
    ''tool_name'', pa.tool_name,
    ''tool_args'', pa.tool_args,
    ''estimated_cost_usd'', pa.estimated_cost_usd,
    ''risk_level'', pa.risk_level,
    ''status'', pa.status,
    ''expires_at'', pa.expires_at
  ) AS payload,
  pa.requested_at AS created_at
FROM mc_pending_approvals pa
JOIN ai_assistants aa ON aa.id = pa.agent_id
WHERE aa.deleted_at IS NULL

UNION ALL

SELECT
  al.id,
  ''approval_resolved''::TEXT AS event_type,
  CASE
    WHEN al.action IN (''denied'', ''auto_denied'') THEN ''warn''
    ELSE ''info''
  END::TEXT AS severity,
  pa.agent_id,
  aa.name AS agent_name,
  al.org_id,
  pa.run_id,
  jsonb_build_object(
    ''action'', al.action,
    ''reason'', al.reason,
    ''tool_name'', pa.tool_name,
    ''resolved_by'', al.resolved_by
  ) AS payload,
  al.created_at
FROM mc_approval_log al
JOIN mc_pending_approvals pa ON pa.id = al.approval_id
JOIN ai_assistants aa ON aa.id = pa.agent_id
WHERE aa.deleted_at IS NULL

UNION ALL

SELECT
  rl.id,
  ''remediation_triggered''::TEXT AS event_type,
  CASE
    WHEN rl.outcome = ''failed'' THEN ''error''
    WHEN rl.outcome = ''skipped'' THEN ''warn''
    ELSE ''info''
  END::TEXT AS severity,
  rl.agent_id,
  aa.name AS agent_name,
  rl.org_id,
  NULL::TEXT AS run_id,
  jsonb_build_object(
    ''action_taken'', rl.action_taken,
    ''outcome'', rl.outcome,
    ''details'', rl.details,
    ''policy_id'', rl.policy_id
  ) AS payload,
  rl.triggered_at AS created_at
FROM mc_remediation_log rl
JOIN ai_assistants aa ON aa.id = rl.agent_id
WHERE aa.deleted_at IS NULL
  AND rl.agent_id IS NOT NULL

UNION ALL

SELECT
  re.id,
  re.event_type,
  CASE
    WHEN re.severity = ''warning'' THEN ''warn''
    ELSE re.severity
  END::TEXT AS severity,
  re.agent_id,
  COALESCE(aa.name, ''Unknown Agent'') AS agent_name,
  re.org_id,
  NULL::TEXT AS run_id,
  re.payload,
  re.created_at
FROM runtime_events re
LEFT JOIN ai_assistants aa ON aa.id = re.agent_id
WHERE (aa.deleted_at IS NULL OR re.agent_id IS NULL)

UNION ALL

SELECT
  rce.id,
  rce.event_type,
  ''info''::TEXT AS severity,
  rce.agent_id,
  aa.name AS agent_name,
  rce.org_id,
  rce.run_id,
  rce.payload,
  rce.created_at
FROM mc_receipt_events rce
JOIN ai_assistants aa ON aa.id = rce.agent_id
WHERE aa.deleted_at IS NULL
', v_trading_branch);
END $$;
