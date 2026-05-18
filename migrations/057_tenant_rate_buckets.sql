-- Migration 057: Tenant rate limiting buckets
-- Phase 1A: Per-tenant message rate limiting (token bucket in DB)

CREATE TABLE IF NOT EXISTS tenant_rate_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  bucket_key TEXT NOT NULL,              -- e.g., 'msg_per_min'
  tokens_remaining INT NOT NULL,
  max_tokens INT NOT NULL DEFAULT 20,
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, bucket_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_rate_buckets_lookup
  ON tenant_rate_buckets(tenant_id, bucket_key);

-- Atomic consume function: decrements tokens, refills if interval elapsed
CREATE OR REPLACE FUNCTION consume_rate_token(
  p_tenant_id UUID,
  p_bucket_key TEXT,
  p_cost INT DEFAULT 1,
  p_max_tokens INT DEFAULT 20,
  p_refill_interval_sec INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_row tenant_rate_buckets%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_elapsed_sec NUMERIC;
  v_refills INT;
  v_new_tokens INT;
BEGIN
  -- Upsert bucket
  INSERT INTO tenant_rate_buckets (tenant_id, bucket_key, tokens_remaining, max_tokens, last_refill_at)
  VALUES (p_tenant_id, p_bucket_key, p_max_tokens, p_max_tokens, v_now)
  ON CONFLICT (tenant_id, bucket_key) DO NOTHING;

  -- Lock and fetch
  SELECT * INTO v_row
  FROM tenant_rate_buckets
  WHERE tenant_id = p_tenant_id AND bucket_key = p_bucket_key
  FOR UPDATE;

  -- Calculate refills since last check
  v_elapsed_sec := EXTRACT(EPOCH FROM (v_now - v_row.last_refill_at));
  v_refills := FLOOR(v_elapsed_sec / p_refill_interval_sec)::INT;

  IF v_refills > 0 THEN
    v_new_tokens := LEAST(v_row.tokens_remaining + (v_refills * p_max_tokens), p_max_tokens);
    UPDATE tenant_rate_buckets
    SET tokens_remaining = v_new_tokens,
        last_refill_at = v_row.last_refill_at + (v_refills * p_refill_interval_sec * interval '1 second')
    WHERE id = v_row.id;
    v_row.tokens_remaining := v_new_tokens;
  END IF;

  -- Try to consume
  IF v_row.tokens_remaining >= p_cost THEN
    UPDATE tenant_rate_buckets
    SET tokens_remaining = tokens_remaining - p_cost
    WHERE id = v_row.id;

    RETURN jsonb_build_object('allowed', true, 'remaining', v_row.tokens_remaining - p_cost);
  ELSE
    -- Calculate retry-after
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', v_row.tokens_remaining,
      'retry_after_ms', ((p_refill_interval_sec - v_elapsed_sec % p_refill_interval_sec) * 1000)::INT
    );
  END IF;
END;
$$;

COMMENT ON TABLE tenant_rate_buckets IS
  'Per-tenant rate limiting via token bucket. See docs/OPENCLAW_INTEGRATION_SPEC.md §2.2';