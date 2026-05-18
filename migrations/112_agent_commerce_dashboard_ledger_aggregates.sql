-- Migration 112: Agent Commerce production dashboard ledger aggregates.
-- Computes historical spend, budget, revenue, and entitlement totals without
-- depending on capped Mission Control list queries.

CREATE INDEX IF NOT EXISTS idx_agent_spend_requests_org_currency_status
  ON agent_spend_requests (org_id, currency, status);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_budget_reservations_org_currency_status
  ON agent_commerce_budget_reservations (org_id, currency, status);

CREATE INDEX IF NOT EXISTS idx_seller_payment_grants_org_currency_status
  ON seller_payment_grants (org_id, currency, status);

CREATE OR REPLACE FUNCTION agent_commerce_production_dashboard_ledger_aggregates(
  p_org_id UUID
)
RETURNS TABLE (
  spend_total_requests BIGINT,
  spend_completed_requests BIGINT,
  spend_failures BIGINT,
  spend_requested_volume JSONB,
  spend_completed_volume JSONB,
  budget_failures BIGINT,
  budget_captured_volume JSONB,
  revenue_completed_grants BIGINT,
  revenue_active_entitlements BIGINT,
  revenue_revoked_or_expired_entitlements BIGINT,
  revenue_completed_volume JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  spend_counts AS (
    SELECT
      COUNT(*)::BIGINT AS total_requests,
      COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_requests,
      COUNT(*) FILTER (WHERE status IN ('failed', 'declined', 'expired', 'cancelled'))::BIGINT AS failures
    FROM agent_spend_requests
    WHERE org_id = p_org_id
  ),
  spend_requested_volume AS (
    SELECT COALESCE(jsonb_object_agg(currency, amount_cents), '{}'::jsonb) AS value
    FROM (
      SELECT lower(currency) AS currency, SUM(amount_cents)::BIGINT AS amount_cents
      FROM agent_spend_requests
      WHERE org_id = p_org_id
      GROUP BY lower(currency)
    ) totals
  ),
  spend_completed_volume AS (
    SELECT COALESCE(jsonb_object_agg(currency, amount_cents), '{}'::jsonb) AS value
    FROM (
      SELECT lower(currency) AS currency, SUM(amount_cents)::BIGINT AS amount_cents
      FROM agent_spend_requests
      WHERE org_id = p_org_id
        AND status = 'completed'
      GROUP BY lower(currency)
    ) totals
  ),
  budget_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failures
    FROM agent_commerce_budget_reservations
    WHERE org_id = p_org_id
  ),
  budget_captured_volume AS (
    SELECT COALESCE(jsonb_object_agg(currency, amount_cents), '{}'::jsonb) AS value
    FROM (
      SELECT lower(currency) AS currency, SUM(amount_cents)::BIGINT AS amount_cents
      FROM agent_commerce_budget_reservations
      WHERE org_id = p_org_id
        AND status = 'captured'
      GROUP BY lower(currency)
    ) totals
  ),
  revenue_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_grants
    FROM seller_payment_grants
    WHERE org_id = p_org_id
  ),
  revenue_completed_volume AS (
    SELECT COALESCE(jsonb_object_agg(currency, amount_cents), '{}'::jsonb) AS value
    FROM (
      SELECT lower(currency) AS currency, SUM(amount_cents)::BIGINT AS amount_cents
      FROM seller_payment_grants
      WHERE org_id = p_org_id
        AND status = 'completed'
      GROUP BY lower(currency)
    ) totals
  ),
  entitlement_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::BIGINT AS active_entitlements,
      COUNT(*) FILTER (WHERE status IN ('revoked', 'expired'))::BIGINT AS revoked_or_expired_entitlements
    FROM agent_commerce_seller_entitlements
    WHERE org_id = p_org_id
  )
  SELECT
    spend_counts.total_requests,
    spend_counts.completed_requests,
    spend_counts.failures,
    spend_requested_volume.value,
    spend_completed_volume.value,
    budget_counts.failures,
    budget_captured_volume.value,
    revenue_counts.completed_grants,
    entitlement_counts.active_entitlements,
    entitlement_counts.revoked_or_expired_entitlements,
    revenue_completed_volume.value
  FROM spend_counts
  CROSS JOIN spend_requested_volume
  CROSS JOIN spend_completed_volume
  CROSS JOIN budget_counts
  CROSS JOIN budget_captured_volume
  CROSS JOIN revenue_counts
  CROSS JOIN revenue_completed_volume
  CROSS JOIN entitlement_counts;
$$;
