-- ============================================================================
-- Agent Commerce: seller entitlements, reversals, and abuse guardrails
-- ============================================================================
-- Completed seller grants must become durable Lucid entitlements instead of
-- living only as provider payment state. Reversals must unwind the entitlement
-- atomically, and write-heavy Agent Commerce surfaces need shared rate limits.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_commerce_seller_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-01',
  schema_version INTEGER NOT NULL DEFAULT 1,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  seller_grant_id UUID NOT NULL REFERENCES seller_payment_grants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired', 'failed')),
  target_type TEXT NOT NULL DEFAULT 'generic'
    CHECK (target_type IN ('subscription', 'payment', 'usage_metric', 'app_public_usage_bucket', 'generic')),
  target_id UUID,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commerce_seller_entitlements_grant
  ON agent_commerce_seller_entitlements (seller_grant_id);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_seller_entitlements_org_status
  ON agent_commerce_seller_entitlements (org_id, status, expires_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_seller_entitlements_target
  ON agent_commerce_seller_entitlements (target_type, target_id)
  WHERE target_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_commerce_seller_entitlements_payment
  ON agent_commerce_seller_entitlements (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_commerce_rate_limit_buckets (
  scope_key TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_seconds INTEGER NOT NULL CHECK (window_seconds > 0),
  count_value INTEGER NOT NULL DEFAULT 0 CHECK (count_value >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_rate_limit_buckets_updated
  ON agent_commerce_rate_limit_buckets (updated_at);

ALTER TABLE agent_commerce_seller_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_commerce_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org agent commerce seller entitlements" ON agent_commerce_seller_entitlements;
CREATE POLICY "Users can view org agent commerce seller entitlements"
  ON agent_commerce_seller_entitlements FOR SELECT
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Service role manages agent commerce seller entitlements" ON agent_commerce_seller_entitlements;
CREATE POLICY "Service role manages agent commerce seller entitlements"
  ON agent_commerce_seller_entitlements FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages agent commerce rate limit buckets" ON agent_commerce_rate_limit_buckets;
CREATE POLICY "Service role manages agent commerce rate limit buckets"
  ON agent_commerce_rate_limit_buckets FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION claim_agent_commerce_rate_limit(
  p_scope_key TEXT,
  p_bucket_key TEXT,
  p_window_seconds INTEGER,
  p_limit INTEGER,
  p_increment INTEGER DEFAULT 1,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_value INTEGER,
  limit_value INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_epoch BIGINT;
  v_window_epoch BIGINT;
  v_window_start TIMESTAMPTZ;
  v_current INTEGER;
BEGIN
  IF p_scope_key IS NULL OR length(trim(p_scope_key)) = 0 THEN
    RAISE EXCEPTION 'Rate-limit scope is required';
  END IF;
  IF p_bucket_key IS NULL OR length(trim(p_bucket_key)) = 0 THEN
    RAISE EXCEPTION 'Rate-limit bucket is required';
  END IF;
  IF p_window_seconds <= 0 OR p_limit <= 0 OR p_increment <= 0 THEN
    RAISE EXCEPTION 'Rate-limit window, limit, and increment must be positive';
  END IF;

  v_epoch := floor(extract(epoch FROM p_now))::BIGINT;
  v_window_epoch := v_epoch - (v_epoch % p_window_seconds);
  v_window_start := to_timestamp(v_window_epoch);

  INSERT INTO agent_commerce_rate_limit_buckets (
    scope_key,
    bucket_key,
    window_start,
    window_seconds,
    count_value,
    updated_at
  )
  VALUES (
    p_scope_key,
    p_bucket_key,
    v_window_start,
    p_window_seconds,
    p_increment,
    p_now
  )
  ON CONFLICT (scope_key, bucket_key, window_start) DO UPDATE
    SET count_value = agent_commerce_rate_limit_buckets.count_value + EXCLUDED.count_value,
        window_seconds = EXCLUDED.window_seconds,
        updated_at = p_now
  RETURNING count_value
  INTO v_current;

  RETURN QUERY
  SELECT
    v_current <= p_limit AS allowed,
    v_current AS current_value,
    p_limit AS limit_value,
    v_window_start + make_interval(secs => p_window_seconds) AS reset_at;
END;
$$;

CREATE OR REPLACE FUNCTION fulfill_agent_commerce_seller_grant(
  p_seller_grant_id UUID,
  p_org_id UUID,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS SETOF agent_commerce_seller_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant seller_payment_grants%ROWTYPE;
  v_entitlement agent_commerce_seller_entitlements%ROWTYPE;
  v_plan plans%ROWTYPE;
  v_resource_type TEXT;
  v_target_type TEXT := 'generic';
  v_plan_name TEXT;
  v_billing_period TEXT;
  v_period_end TIMESTAMPTZ;
  v_subscription_id UUID;
  v_payment_id UUID;
  v_provider_payment_id TEXT;
  v_customer_id TEXT;
  v_metadata JSONB;
BEGIN
  SELECT *
  INTO v_grant
  FROM seller_payment_grants
  WHERE id = p_seller_grant_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller payment grant was not found';
  END IF;

  IF v_grant.status <> 'completed' THEN
    RAISE EXCEPTION 'Cannot fulfill seller payment grant with status %', v_grant.status;
  END IF;

  SELECT *
  INTO v_entitlement
  FROM agent_commerce_seller_entitlements
  WHERE seller_grant_id = p_seller_grant_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY
    SELECT *
    FROM agent_commerce_seller_entitlements
    WHERE id = v_entitlement.id;
    RETURN;
  END IF;

  v_resource_type := lower(v_grant.resource_type);
  v_provider_payment_id := COALESCE(v_grant.provider_payment_id, v_grant.grant_id, v_grant.id::TEXT);
  v_customer_id := COALESCE(
    NULLIF(v_grant.customer_reference, ''),
    NULLIF(v_grant.metadata->>'stripe_customer_id', ''),
    NULLIF(v_grant.metadata->>'customer_id', '')
  );
  v_metadata := COALESCE(v_grant.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'agent_commerce',
      'seller_grant_id', v_grant.id,
      'provider', v_grant.provider,
      'provider_payment_id', v_provider_payment_id,
      'fulfilled_at', p_now
    );

  IF v_resource_type IN ('plan', 'subscription', 'lucid_plan', 'lucidmerged_plan') THEN
    v_target_type := 'subscription';
    v_plan_name := lower(COALESCE(
      NULLIF(v_grant.metadata->>'plan_name', ''),
      NULLIF(v_grant.metadata->>'plan', ''),
      NULLIF(v_grant.resource_id, ''),
      'pro'
    ));
    v_billing_period := lower(COALESCE(NULLIF(v_grant.metadata->>'billing_period', ''), 'monthly'));
    IF v_billing_period NOT IN ('monthly', 'yearly') THEN
      v_billing_period := 'monthly';
    END IF;

    SELECT *
    INTO v_plan
    FROM plans
    WHERE name = v_plan_name
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Agent Commerce plan entitlement targets unknown plan %', v_plan_name;
    END IF;

    v_period_end := CASE
      WHEN v_billing_period = 'yearly' THEN p_now + interval '1 year'
      ELSE p_now + interval '1 month'
    END;

    UPDATE subscriptions
    SET status = 'canceled',
        cancel_at_period_end = false,
        canceled_at = COALESCE(canceled_at, p_now),
        updated_at = p_now,
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object('canceled_by_agent_commerce_grant_id', v_grant.id)
    WHERE org_id = p_org_id
      AND status IN ('active', 'trialing', 'past_due');

    INSERT INTO subscriptions (
      org_id,
      plan_id,
      status,
      billing_period,
      payment_method,
      current_period_start,
      current_period_end,
      stripe_customer_id,
      metadata
    )
    VALUES (
      p_org_id,
      v_plan.id,
      'active',
      v_billing_period,
      'stripe_card',
      p_now,
      v_period_end,
      v_customer_id,
      v_metadata || jsonb_build_object('agent_commerce_entitlement_target', 'plan')
    )
    RETURNING id
    INTO v_subscription_id;

    INSERT INTO payments (
      subscription_id,
      org_id,
      amount,
      currency,
      payment_method,
      status,
      provider,
      provider_payment_id,
      provider_customer_id,
      metadata
    )
    VALUES (
      v_subscription_id,
      p_org_id,
      v_grant.amount_cents,
      lower(v_grant.currency),
      'agent_commerce_spt',
      'succeeded',
      CASE WHEN v_grant.provider = 'stripe_shared_payment_tokens' THEN 'stripe' ELSE 'stripe' END,
      v_provider_payment_id,
      v_customer_id,
      v_metadata
    )
    RETURNING id
    INTO v_payment_id;

    INSERT INTO agent_commerce_seller_entitlements (
      org_id,
      seller_grant_id,
      provider,
      resource_type,
      resource_id,
      status,
      target_type,
      target_id,
      payment_id,
      effective_at,
      expires_at,
      metadata
    )
    VALUES (
      p_org_id,
      v_grant.id,
      v_grant.provider,
      v_grant.resource_type,
      v_grant.resource_id,
      'active',
      v_target_type,
      v_subscription_id,
      v_payment_id,
      p_now,
      v_period_end,
      v_metadata || jsonb_build_object('plan_name', v_plan.name, 'billing_period', v_billing_period)
    )
    RETURNING *
    INTO v_entitlement;

    UPDATE seller_payment_grants
    SET entitlement_ref = 'subscription:' || v_subscription_id::TEXT,
        updated_at = p_now,
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'entitlement_id', v_entitlement.id,
            'entitlement_ref', 'subscription:' || v_subscription_id::TEXT,
            'fulfilled_at', p_now
          )
    WHERE id = v_grant.id;
  ELSE
    v_target_type := CASE
      WHEN v_resource_type IN ('app_service', 'app_service_usage', 'generated_app', 'public_app') THEN 'app_public_usage_bucket'
      WHEN v_resource_type IN ('usage_metric', 'api_usage', 'credits', 'quota') THEN 'usage_metric'
      ELSE 'generic'
    END;

    INSERT INTO agent_commerce_seller_entitlements (
      org_id,
      seller_grant_id,
      provider,
      resource_type,
      resource_id,
      status,
      target_type,
      effective_at,
      expires_at,
      metadata
    )
    VALUES (
      p_org_id,
      v_grant.id,
      v_grant.provider,
      v_grant.resource_type,
      v_grant.resource_id,
      'active',
      v_target_type,
      p_now,
      COALESCE(v_grant.expires_at, NULLIF(v_grant.metadata->>'entitlement_expires_at', '')::TIMESTAMPTZ),
      v_metadata || jsonb_build_object('agent_commerce_entitlement_target', v_target_type)
    )
    RETURNING *
    INTO v_entitlement;

    UPDATE seller_payment_grants
    SET entitlement_ref = v_target_type || ':' || v_entitlement.id::TEXT,
        updated_at = p_now,
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'entitlement_id', v_entitlement.id,
            'entitlement_ref', v_target_type || ':' || v_entitlement.id::TEXT,
            'fulfilled_at', p_now
          )
    WHERE id = v_grant.id;
  END IF;

  RETURN QUERY
  SELECT *
  FROM agent_commerce_seller_entitlements
  WHERE id = v_entitlement.id;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_agent_commerce_seller_entitlement(
  p_seller_grant_id UUID,
  p_org_id UUID,
  p_reason TEXT,
  p_now TIMESTAMPTZ DEFAULT now(),
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS SETOF agent_commerce_seller_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant seller_payment_grants%ROWTYPE;
  v_entitlement agent_commerce_seller_entitlements%ROWTYPE;
BEGIN
  SELECT *
  INTO v_grant
  FROM seller_payment_grants
  WHERE id = p_seller_grant_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller payment grant was not found';
  END IF;

  SELECT *
  INTO v_entitlement
  FROM agent_commerce_seller_entitlements
  WHERE seller_grant_id = p_seller_grant_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_entitlement.target_type = 'subscription' AND v_entitlement.target_id IS NOT NULL THEN
      UPDATE subscriptions
      SET status = 'canceled',
          cancel_at_period_end = false,
          canceled_at = COALESCE(canceled_at, p_now),
          updated_at = p_now,
          metadata = COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'agent_commerce_revoke_reason', p_reason,
              'agent_commerce_revoked_at', p_now
            )
      WHERE id = v_entitlement.target_id
        AND org_id = p_org_id;
    END IF;

    IF v_entitlement.payment_id IS NOT NULL
       AND p_reason IN ('refund', 'charge_refunded', 'dispute', 'charge_dispute', 'payment_canceled', 'grant_revoked') THEN
      UPDATE payments
      SET status = 'refunded',
          updated_at = p_now,
          metadata = COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'agent_commerce_reversal_reason', p_reason,
              'agent_commerce_reversed_at', p_now
            )
            || COALESCE(p_metadata, '{}'::jsonb)
      WHERE id = v_entitlement.payment_id
        AND org_id = p_org_id
        AND status <> 'refunded';
    END IF;

    UPDATE agent_commerce_seller_entitlements
    SET status = CASE WHEN status = 'active' THEN 'revoked' ELSE status END,
        revoked_at = COALESCE(revoked_at, p_now),
        revoke_reason = COALESCE(p_reason, revoke_reason),
        updated_at = p_now,
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object('revoked_at', p_now, 'revoke_reason', p_reason)
          || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = v_entitlement.id
    RETURNING *
    INTO v_entitlement;
  END IF;

  UPDATE seller_payment_grants
  SET status = 'revoked',
      updated_at = p_now,
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('revoke_reason', p_reason, 'revoked_at', p_now)
        || COALESCE(p_metadata, '{}'::jsonb)
  WHERE id = p_seller_grant_id
    AND org_id = p_org_id
    AND status IN ('received', 'validating', 'accepted', 'processing', 'completed');

  IF FOUND THEN
    RETURN QUERY
    SELECT *
    FROM agent_commerce_seller_entitlements
    WHERE id = v_entitlement.id;
  END IF;
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
  WHERE status IN ('approved', 'credential_issuing', 'credential_issued')

  UNION

  SELECT DISTINCT org_id
  FROM seller_payment_grants
  WHERE status IN ('received', 'validating', 'accepted', 'processing', 'completed')

  UNION

  SELECT DISTINCT org_id
  FROM agent_commerce_budget_reservations
  WHERE status = 'reserved'

  UNION

  SELECT DISTINCT org_id
  FROM agent_commerce_seller_entitlements
  WHERE status = 'active';
$$;

CREATE OR REPLACE FUNCTION agent_commerce_reconcile_org(
  p_org_id UUID,
  p_now TIMESTAMPTZ DEFAULT now(),
  p_stuck_after INTERVAL DEFAULT interval '15 minutes'
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
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reconciled_reason', 'spend_request_expired')
  WHERE org_id = p_org_id
    AND status IN ('draft', 'requires_connection', 'requires_approval', 'approved', 'credential_issuing', 'credential_issued')
    AND expires_at IS NOT NULL
    AND expires_at <= p_now;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'spend_request'::TEXT, 'expired'::TEXT, v_count;

  UPDATE agent_spend_requests
  SET status = 'failed',
      updated_at = p_now,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reconciled_reason', 'credential_issuing_stuck')
  WHERE org_id = p_org_id
    AND status = 'credential_issuing'
    AND updated_at <= p_now - p_stuck_after;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'spend_request'::TEXT, 'credential_issuing_stuck'::TEXT, v_count;

  UPDATE agent_commerce_budget_reservations r
  SET status = 'expired',
      reason = COALESCE(r.reason, 'reservation_expired'),
      updated_at = p_now,
      metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object('reconciled_reason', 'reservation_expired')
  FROM agent_spend_requests s
  WHERE r.spend_request_id = s.id
    AND r.org_id = p_org_id
    AND r.status = 'reserved'
    AND r.expires_at IS NOT NULL
    AND r.expires_at <= p_now;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'budget_reservation'::TEXT, 'expired'::TEXT, v_count;

  UPDATE agent_commerce_budget_reservations r
  SET status = 'released',
      reason = COALESCE(r.reason, 'spend_request_terminal'),
      released_at = COALESCE(r.released_at, p_now),
      updated_at = p_now,
      metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object('reconciled_reason', 'spend_request_terminal')
  FROM agent_spend_requests s
  WHERE r.spend_request_id = s.id
    AND r.org_id = p_org_id
    AND r.status = 'reserved'
    AND s.status IN ('declined', 'expired', 'failed', 'cancelled');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'budget_reservation'::TEXT, 'released_for_terminal_spend'::TEXT, v_count;

  UPDATE seller_payment_grants
  SET status = 'expired',
      updated_at = p_now,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reconciled_reason', 'seller_grant_expired')
  WHERE org_id = p_org_id
    AND status IN ('received', 'validating', 'accepted')
    AND expires_at IS NOT NULL
    AND expires_at <= p_now;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'seller_grant'::TEXT, 'expired'::TEXT, v_count;

  UPDATE agent_commerce_seller_entitlements
  SET status = 'expired',
      updated_at = p_now,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reconciled_reason', 'seller_entitlement_expired')
  WHERE org_id = p_org_id
    AND status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at <= p_now;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'seller_entitlement'::TEXT, 'expired'::TEXT, v_count;

  UPDATE agent_commerce_idempotency_keys
  SET status = 'expired',
      updated_at = p_now
  WHERE org_id = p_org_id
    AND status = 'claimed'
    AND expires_at <= p_now;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'idempotency_key'::TEXT, 'expired'::TEXT, v_count;
END;
$$;
