-- Migration: Usage increment idempotency
-- Prevents double-charging on retries / transport repeats.
--
-- Adds a lightweight dedup table keyed by caller-supplied idempotency keys.
-- The increment_usage_metric RPC is replaced with an optional p_idempotency_key
-- parameter: when supplied, a duplicate key is silently skipped.

-- 1. Dedup table
CREATE TABLE IF NOT EXISTS usage_idempotency_keys (
  key TEXT PRIMARY KEY,
  org_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for periodic cleanup (keys older than 24 h)
CREATE INDEX IF NOT EXISTS idx_usage_idempotency_created
  ON usage_idempotency_keys (created_at);

-- RLS: service-role only (never accessed from client)
ALTER TABLE usage_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- 2. Replace increment_usage_metric with idempotency-aware version
CREATE OR REPLACE FUNCTION increment_usage_metric(
  p_org_id UUID,
  p_metric_name TEXT,
  p_amount INTEGER,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- If an idempotency key is supplied, attempt INSERT.
  -- ON CONFLICT → key already seen → skip the increment entirely.
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO usage_idempotency_keys (key, org_id, metric_name)
    VALUES (p_idempotency_key, p_org_id, p_metric_name)
    ON CONFLICT (key) DO NOTHING;

    IF NOT FOUND THEN
      -- Key already existed — this is a duplicate request
      RETURN;
    END IF;
  END IF;

  -- Normal upsert (unchanged logic)
  INSERT INTO usage_metrics (
    org_id,
    metric_name,
    metric_value,
    period_start,
    period_end
  ) VALUES (
    p_org_id,
    p_metric_name,
    p_amount,
    p_period_start,
    p_period_end
  )
  ON CONFLICT (org_id, metric_name, period_start, period_end)
  DO UPDATE SET
    metric_value = usage_metrics.metric_value + p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

-- 3. Cleanup function — call from pg_cron or external scheduler
CREATE OR REPLACE FUNCTION cleanup_usage_idempotency_keys(
  p_max_age INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM usage_idempotency_keys
  WHERE created_at < now() - p_max_age;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

COMMENT ON TABLE usage_idempotency_keys IS
  'Dedup table for usage increment requests. Keys expire after 24h via cleanup_usage_idempotency_keys().';
