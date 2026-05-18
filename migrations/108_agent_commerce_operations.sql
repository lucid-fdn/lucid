-- Migration 108: Agent Commerce operations and reconciliation.
-- Adds fail-closed proof claiming, provider health seed rows, and
-- reconciliation primitives for approvals, credential issuance, and webhooks.

CREATE INDEX IF NOT EXISTS idx_agent_spend_requests_reconciliation
  ON agent_spend_requests (org_id, status, updated_at, expires_at)
  WHERE status IN ('requires_connection', 'requires_approval', 'approved', 'credential_issuing', 'credential_issued');

CREATE INDEX IF NOT EXISTS idx_machine_payment_challenges_reconciliation
  ON machine_payment_challenges (org_id, status, expires_at)
  WHERE status = 'challenge_created';

CREATE INDEX IF NOT EXISTS idx_seller_payment_grants_reconciliation
  ON seller_payment_grants (org_id, status, expires_at)
  WHERE status IN ('received', 'validating', 'accepted', 'processing');

CREATE INDEX IF NOT EXISTS idx_agent_commerce_events_provider_reconciliation
  ON agent_commerce_events (org_id, actor_type, entity_type, created_at DESC)
  WHERE actor_type = 'provider';

INSERT INTO agent_commerce_provider_health (
  provider,
  mode,
  status,
  metadata
)
VALUES
  ('manual', 'live', 'healthy', '{"seeded_by":"108_agent_commerce_operations"}'::jsonb),
  ('stripe_link_agents', 'waitlist', 'disabled', '{"seeded_by":"108_agent_commerce_operations"}'::jsonb),
  ('stripe_shared_payment_tokens', 'preview', 'disabled', '{"seeded_by":"108_agent_commerce_operations"}'::jsonb),
  ('stripe_issuing', 'preview', 'disabled', '{"seeded_by":"108_agent_commerce_operations"}'::jsonb),
  ('machine_payments_mpp', 'preview', 'disabled', '{"seeded_by":"108_agent_commerce_operations"}'::jsonb),
  ('machine_payments_x402', 'preview', 'disabled', '{"seeded_by":"108_agent_commerce_operations"}'::jsonb),
  ('crypto_wallet', 'disabled', 'disabled', '{"seeded_by":"108_agent_commerce_operations"}'::jsonb)
ON CONFLICT (provider) DO NOTHING;

CREATE OR REPLACE FUNCTION claim_machine_payment_proof(
  p_challenge_id UUID,
  p_org_id UUID,
  p_provider TEXT,
  p_proof_hash TEXT,
  p_provider_payment_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  challenge_id UUID,
  org_id UUID,
  provider TEXT,
  proof_hash TEXT,
  status TEXT,
  provider_payment_id TEXT,
  claimed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  metadata JSONB,
  first_claim BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge machine_payment_challenges%ROWTYPE;
  v_inserted INTEGER := 0;
BEGIN
  SELECT *
  INTO v_challenge
  FROM machine_payment_challenges
  WHERE id = p_challenge_id
    AND org_id = p_org_id
    AND provider = p_provider
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_challenge.status = 'challenge_created' AND v_challenge.expires_at <= now() THEN
    UPDATE machine_payment_challenges
    SET status = 'expired',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'reconciliation',
          jsonb_build_object('reason', 'proof_claim_after_expiry', 'at', now())
        )
    WHERE id = p_challenge_id
      AND org_id = p_org_id;
    RETURN;
  END IF;

  IF v_challenge.status = 'challenge_created' THEN
    INSERT INTO machine_payment_proof_claims (
      challenge_id,
      org_id,
      provider,
      proof_hash,
      provider_payment_id,
      metadata
    )
    VALUES (
      p_challenge_id,
      p_org_id,
      p_provider,
      p_proof_hash,
      p_provider_payment_id,
      COALESCE(p_metadata, '{}'::jsonb)
    )
    ON CONFLICT (provider, proof_hash) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 1 THEN
      UPDATE machine_payment_challenges
      SET status = 'proof_claimed'
      WHERE id = p_challenge_id
        AND org_id = p_org_id
        AND status = 'challenge_created';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.challenge_id,
    c.org_id,
    c.provider,
    c.proof_hash,
    c.status,
    c.provider_payment_id,
    c.claimed_at,
    c.settled_at,
    c.metadata,
    (v_inserted = 1) AS first_claim
  FROM machine_payment_proof_claims c
  WHERE c.challenge_id = p_challenge_id
    AND c.org_id = p_org_id
    AND c.provider = p_provider
    AND c.proof_hash = p_proof_hash
  FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION agent_commerce_open_org_ids()
RETURNS TABLE (org_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT org_id
  FROM agent_spend_requests
  WHERE status IN ('requires_connection', 'requires_approval', 'approved', 'credential_issuing', 'credential_issued')
  UNION
  SELECT DISTINCT org_id
  FROM machine_payment_challenges
  WHERE status = 'challenge_created'
  UNION
  SELECT DISTINCT org_id
  FROM seller_payment_grants
  WHERE status IN ('received', 'validating', 'accepted', 'processing');
$$;

CREATE OR REPLACE FUNCTION agent_commerce_reconcile_org(
  p_org_id UUID,
  p_now TIMESTAMPTZ DEFAULT now(),
  p_stuck_after INTERVAL DEFAULT INTERVAL '15 minutes'
)
RETURNS TABLE (
  entity_type TEXT,
  action TEXT,
  updated_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE agent_spend_requests
  SET status = 'expired',
      updated_at = p_now,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciliation',
        jsonb_build_object('reason', 'spend_request_expired', 'at', p_now)
      )
  WHERE org_id = p_org_id
    AND status IN ('requires_connection', 'requires_approval', 'approved', 'credential_issuing', 'credential_issued')
    AND expires_at IS NOT NULL
    AND expires_at <= p_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'spend_request'::TEXT, 'expired'::TEXT, v_count;

  UPDATE agent_spend_requests
  SET status = 'failed',
      updated_at = p_now,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciliation',
        jsonb_build_object('reason', 'credential_issuing_stuck', 'at', p_now)
      )
  WHERE org_id = p_org_id
    AND status = 'credential_issuing'
    AND updated_at <= p_now - p_stuck_after;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'spend_request'::TEXT, 'failed_stuck_credential_issuing'::TEXT, v_count;

  UPDATE machine_payment_challenges
  SET status = 'expired',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciliation',
        jsonb_build_object('reason', 'machine_challenge_expired', 'at', p_now)
      )
  WHERE org_id = p_org_id
    AND status = 'challenge_created'
    AND expires_at <= p_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'machine_challenge'::TEXT, 'expired'::TEXT, v_count;

  UPDATE seller_payment_grants
  SET status = 'expired',
      updated_at = p_now,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciliation',
        jsonb_build_object('reason', 'seller_grant_expired', 'at', p_now)
      )
  WHERE org_id = p_org_id
    AND status IN ('received', 'validating', 'accepted', 'processing')
    AND expires_at IS NOT NULL
    AND expires_at <= p_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'seller_grant'::TEXT, 'expired'::TEXT, v_count;

  UPDATE agent_commerce_idempotency_keys
  SET status = 'expired'
  WHERE org_id = p_org_id
    AND status = 'reserved'
    AND expires_at <= p_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'idempotency_key'::TEXT, 'expired'::TEXT, v_count;
END;
$$;

CREATE OR REPLACE FUNCTION agent_commerce_provider_event_mismatches(
  p_org_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  provider TEXT,
  event_type TEXT,
  entity_type TEXT,
  entity_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS event_id,
    e.provider,
    e.event_type,
    e.entity_type,
    e.entity_id,
    CASE
      WHEN e.entity_type = 'spend_request' AND s.id IS NULL THEN 'missing_spend_request'
      WHEN e.entity_type = 'seller_grant' AND g.id IS NULL THEN 'missing_seller_grant'
      WHEN e.entity_type = 'machine_challenge' AND c.id IS NULL THEN 'missing_machine_challenge'
      WHEN e.entity_type = 'proof_claim' AND p.id IS NULL THEN 'missing_proof_claim'
      WHEN e.entity_type = 'provider_health' AND e.event_type NOT LIKE 'provider_health.%' THEN 'unmatched_provider_event'
      ELSE 'unknown'
    END AS reason,
    e.created_at
  FROM agent_commerce_events e
  LEFT JOIN agent_spend_requests s
    ON e.entity_type = 'spend_request' AND e.entity_id = s.id AND e.org_id = s.org_id
  LEFT JOIN seller_payment_grants g
    ON e.entity_type = 'seller_grant' AND e.entity_id = g.id AND e.org_id = g.org_id
  LEFT JOIN machine_payment_challenges c
    ON e.entity_type = 'machine_challenge' AND e.entity_id = c.id AND e.org_id = c.org_id
  LEFT JOIN machine_payment_proof_claims p
    ON e.entity_type = 'proof_claim' AND e.entity_id = p.id AND e.org_id = p.org_id
  WHERE e.org_id = p_org_id
    AND e.actor_type = 'provider'
    AND (
      (e.entity_type = 'spend_request' AND s.id IS NULL)
      OR (e.entity_type = 'seller_grant' AND g.id IS NULL)
      OR (e.entity_type = 'machine_challenge' AND c.id IS NULL)
      OR (e.entity_type = 'proof_claim' AND p.id IS NULL)
      OR (e.entity_type = 'provider_health' AND e.event_type NOT LIKE 'provider_health.%')
    )
  ORDER BY e.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
$$;
