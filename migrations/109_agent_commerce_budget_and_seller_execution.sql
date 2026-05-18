-- Migration 109: Agent Commerce budget reservations and seller execution.
-- Adds a first-class reservation ledger before provider side effects and
-- transactional completion/capture semantics for spend requests.

CREATE TABLE IF NOT EXISTS agent_commerce_budget_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-01',
  schema_version INTEGER NOT NULL DEFAULT 1,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  spend_request_id UUID NOT NULL REFERENCES agent_spend_requests(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'captured', 'released', 'expired', 'failed')),
  reason TEXT,
  expires_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commerce_budget_reservations_spend
  ON agent_commerce_budget_reservations (spend_request_id);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_budget_reservations_org_status
  ON agent_commerce_budget_reservations (org_id, status, expires_at, updated_at);

ALTER TABLE agent_commerce_budget_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org agent commerce budget reservations"
  ON agent_commerce_budget_reservations;
CREATE POLICY "Users can view org agent commerce budget reservations"
  ON agent_commerce_budget_reservations FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role manages agent commerce budget reservations"
  ON agent_commerce_budget_reservations;
CREATE POLICY "Service role manages agent commerce budget reservations"
  ON agent_commerce_budget_reservations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION reserve_agent_spend_budget(
  p_spend_request_id UUID,
  p_org_id UUID,
  p_amount_cents INTEGER,
  p_currency TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  contract_version TEXT,
  schema_version INTEGER,
  org_id UUID,
  spend_request_id UUID,
  amount_cents INTEGER,
  currency TEXT,
  status TEXT,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  metadata JSONB,
  first_reservation BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spend agent_spend_requests%ROWTYPE;
  v_inserted INTEGER := 0;
BEGIN
  SELECT *
  INTO v_spend
  FROM agent_spend_requests
  WHERE id = p_spend_request_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent Commerce spend request was not found';
  END IF;

  IF v_spend.status NOT IN ('approved', 'credential_issuing', 'credential_issued') THEN
    RAISE EXCEPTION 'Cannot reserve budget for spend request status %', v_spend.status;
  END IF;

  IF v_spend.amount_cents <> p_amount_cents OR lower(v_spend.currency) <> lower(p_currency) THEN
    RAISE EXCEPTION 'Budget reservation amount does not match spend request amount';
  END IF;

  INSERT INTO agent_commerce_budget_reservations (
    org_id,
    spend_request_id,
    amount_cents,
    currency,
    status,
    expires_at,
    metadata
  )
  VALUES (
    p_org_id,
    p_spend_request_id,
    p_amount_cents,
    lower(p_currency),
    'reserved',
    COALESCE(p_expires_at, v_spend.expires_at),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (spend_request_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN QUERY
  SELECT
    r.id,
    r.contract_version,
    r.schema_version,
    r.org_id,
    r.spend_request_id,
    r.amount_cents,
    r.currency,
    r.status,
    r.reason,
    r.expires_at,
    r.captured_at,
    r.released_at,
    r.created_at,
    r.updated_at,
    r.metadata,
    (v_inserted = 1) AS first_reservation
  FROM agent_commerce_budget_reservations r
  WHERE r.spend_request_id = p_spend_request_id
    AND r.org_id = p_org_id
  FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION release_agent_spend_budget(
  p_spend_request_id UUID,
  p_org_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  contract_version TEXT,
  schema_version INTEGER,
  org_id UUID,
  spend_request_id UUID,
  amount_cents INTEGER,
  currency TEXT,
  status TEXT,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation agent_commerce_budget_reservations%ROWTYPE;
BEGIN
  UPDATE agent_commerce_budget_reservations r
  SET status = 'released',
      reason = COALESCE(p_reason, r.reason),
      released_at = COALESCE(r.released_at, now()),
      updated_at = now(),
      metadata = COALESCE(r.metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
  WHERE r.spend_request_id = p_spend_request_id
    AND r.org_id = p_org_id
    AND r.status = 'reserved'
  RETURNING *
  INTO v_reservation;

  IF NOT FOUND THEN
    SELECT *
    INTO v_reservation
    FROM agent_commerce_budget_reservations r
    WHERE r.spend_request_id = p_spend_request_id
      AND r.org_id = p_org_id;
  END IF;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      v_reservation.id,
      v_reservation.contract_version,
      v_reservation.schema_version,
      v_reservation.org_id,
      v_reservation.spend_request_id,
      v_reservation.amount_cents,
      v_reservation.currency,
      v_reservation.status,
      v_reservation.reason,
      v_reservation.expires_at,
      v_reservation.captured_at,
      v_reservation.released_at,
      v_reservation.created_at,
      v_reservation.updated_at,
      v_reservation.metadata;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION complete_agent_spend_request(
  p_spend_request_id UUID,
  p_org_id UUID,
  p_provider_request_id TEXT DEFAULT NULL,
  p_provider_credential_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS SETOF agent_spend_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spend agent_spend_requests%ROWTYPE;
BEGIN
  SELECT *
  INTO v_spend
  FROM agent_spend_requests
  WHERE id = p_spend_request_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent Commerce spend request was not found';
  END IF;

  IF v_spend.status NOT IN ('approved', 'credential_issued') THEN
    RAISE EXCEPTION 'Cannot complete spend request from status %', v_spend.status;
  END IF;

  UPDATE agent_spend_requests
  SET status = 'completed',
      completed_at = now(),
      updated_at = now(),
      provider_request_id = COALESCE(p_provider_request_id, provider_request_id),
      provider_credential_id = COALESCE(p_provider_credential_id, provider_credential_id),
      metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
  WHERE id = p_spend_request_id
    AND org_id = p_org_id;

  UPDATE agent_commerce_budget_reservations
  SET status = 'captured',
      captured_at = COALESCE(captured_at, now()),
      updated_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'capture',
        jsonb_build_object('reason', 'spend_request_completed', 'at', now())
      )
  WHERE spend_request_id = p_spend_request_id
    AND org_id = p_org_id
    AND status = 'reserved';

  RETURN QUERY
  SELECT *
  FROM agent_spend_requests
  WHERE id = p_spend_request_id
    AND org_id = p_org_id;
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
  WHERE status IN ('received', 'validating', 'accepted', 'processing')
  UNION
  SELECT DISTINCT org_id
  FROM agent_commerce_budget_reservations
  WHERE status = 'reserved';
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

  UPDATE agent_commerce_budget_reservations r
  SET status = 'expired',
      reason = 'linked_spend_request_expired',
      released_at = COALESCE(r.released_at, p_now),
      updated_at = p_now,
      metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciliation',
        jsonb_build_object('reason', 'linked_spend_request_expired', 'at', p_now)
      )
  FROM agent_spend_requests s
  WHERE r.org_id = p_org_id
    AND r.status = 'reserved'
    AND r.spend_request_id = s.id
    AND s.org_id = p_org_id
    AND s.status = 'expired';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'budget_reservation'::TEXT, 'expired_linked_spend_request'::TEXT, v_count;

  UPDATE agent_commerce_budget_reservations r
  SET status = 'failed',
      reason = 'linked_spend_request_failed',
      released_at = COALESCE(r.released_at, p_now),
      updated_at = p_now,
      metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciliation',
        jsonb_build_object('reason', 'linked_spend_request_failed', 'at', p_now)
      )
  FROM agent_spend_requests s
  WHERE r.org_id = p_org_id
    AND r.status = 'reserved'
    AND r.spend_request_id = s.id
    AND s.org_id = p_org_id
    AND s.status = 'failed';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'budget_reservation'::TEXT, 'failed_linked_spend_request'::TEXT, v_count;

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
