-- Migration 113: Agent Commerce provider mismatch count.
-- Keeps production dashboard provider mismatch totals historical while the
-- Mission Control panel can remain a capped recent feed.

CREATE INDEX IF NOT EXISTS idx_agent_commerce_events_provider_mismatch_scan
  ON agent_commerce_events (org_id, entity_type, event_type, created_at DESC)
  WHERE actor_type = 'provider';

CREATE OR REPLACE FUNCTION agent_commerce_provider_event_mismatch_count(
  p_org_id UUID
)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::BIGINT
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
    );
$$;
