-- ============================================================================
-- Migration: 074_webhook_events_and_billing_fixes
-- Purpose: Webhook idempotency table + subscription status constraint fix
-- ============================================================================

-- Webhook idempotency table
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT '',
  processed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, event_id, event_type)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup ON webhook_events(provider, event_id, event_type);

-- RLS: only service role can access webhook_events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage webhook_events" ON webhook_events;
CREATE POLICY "Service role can manage webhook_events"
  ON webhook_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Fix: ensure subscriptions status constraint allows all valid statuses
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused'));

-- Update get_org_subscription to also return trialing subscriptions
CREATE OR REPLACE FUNCTION get_org_subscription(p_org_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  org_id UUID,
  plan_id UUID,
  plan_name TEXT,
  plan_display_name TEXT,
  status TEXT,
  billing_period TEXT,
  payment_method TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  features JSONB,
  limits JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id as subscription_id,
    s.org_id,
    s.plan_id,
    p.name as plan_name,
    p.display_name as plan_display_name,
    s.status,
    s.billing_period,
    s.payment_method,
    s.current_period_start,
    s.current_period_end,
    p.features,
    p.limits
  FROM subscriptions s
  JOIN plans p ON s.plan_id = p.id
  WHERE s.org_id = p_org_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;
