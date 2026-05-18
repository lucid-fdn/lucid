-- Migration 066: Fix consume_rate_tokens_dual to use tenant_rate_buckets schema
--
-- Why:
-- - Migration 065 introduced consume_rate_tokens_dual against table `rate_limit_buckets`
-- - This project's canonical table is `tenant_rate_buckets` (migrations 057 + 063)
-- - Without this fix, RPC may fail and limiter fail-opens in runtime.

CREATE OR REPLACE FUNCTION consume_rate_tokens_dual(
  p_tenant_key TEXT,
  p_user_key TEXT,
  p_tenant_bucket_key TEXT DEFAULT 'msg_per_min',
  p_user_bucket_key TEXT DEFAULT 'msg_per_min_user',
  p_cost INT DEFAULT 1,
  p_tenant_max_tokens INT DEFAULT 20,
  p_user_max_tokens INT DEFAULT 10,
  p_refill_interval_sec INT DEFAULT 60
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();

  v_tenant_row tenant_rate_buckets%ROWTYPE;
  v_user_row tenant_rate_buckets%ROWTYPE;

  v_tenant_elapsed_sec NUMERIC;
  v_user_elapsed_sec NUMERIC;
  v_tenant_refills INT;
  v_user_refills INT;
  v_tenant_tokens INT;
  v_user_tokens INT;
  v_retry_after_ms INT := 0;
BEGIN
  -- Ensure both buckets exist.
  INSERT INTO tenant_rate_buckets (tenant_id, bucket_key, tokens_remaining, max_tokens, last_refill_at)
  VALUES (p_tenant_key, p_tenant_bucket_key, p_tenant_max_tokens, p_tenant_max_tokens, v_now)
  ON CONFLICT (tenant_id, bucket_key) DO NOTHING;

  INSERT INTO tenant_rate_buckets (tenant_id, bucket_key, tokens_remaining, max_tokens, last_refill_at)
  VALUES (p_user_key, p_user_bucket_key, p_user_max_tokens, p_user_max_tokens, v_now)
  ON CONFLICT (tenant_id, bucket_key) DO NOTHING;

  -- Lock rows in a stable order (tenant first, then user) and refill.
  SELECT * INTO v_tenant_row
  FROM tenant_rate_buckets
  WHERE tenant_id = p_tenant_key AND bucket_key = p_tenant_bucket_key
  FOR UPDATE;

  SELECT * INTO v_user_row
  FROM tenant_rate_buckets
  WHERE tenant_id = p_user_key AND bucket_key = p_user_bucket_key
  FOR UPDATE;

  -- Refill tenant bucket
  v_tenant_elapsed_sec := EXTRACT(EPOCH FROM (v_now - v_tenant_row.last_refill_at));
  v_tenant_refills := FLOOR(v_tenant_elapsed_sec / p_refill_interval_sec)::INT;
  IF v_tenant_refills > 0 THEN
    v_tenant_tokens := LEAST(v_tenant_row.tokens_remaining + (v_tenant_refills * p_tenant_max_tokens), p_tenant_max_tokens);
    v_tenant_row.tokens_remaining := v_tenant_tokens;
  END IF;

  -- Refill user bucket
  v_user_elapsed_sec := EXTRACT(EPOCH FROM (v_now - v_user_row.last_refill_at));
  v_user_refills := FLOOR(v_user_elapsed_sec / p_refill_interval_sec)::INT;
  IF v_user_refills > 0 THEN
    v_user_tokens := LEAST(v_user_row.tokens_remaining + (v_user_refills * p_user_max_tokens), p_user_max_tokens);
    v_user_row.tokens_remaining := v_user_tokens;
  END IF;

  -- Default if no refill occurred
  v_tenant_tokens := COALESCE(v_tenant_tokens, v_tenant_row.tokens_remaining);
  v_user_tokens := COALESCE(v_user_tokens, v_user_row.tokens_remaining);

  -- All-or-nothing consume
  IF v_tenant_tokens >= p_cost AND v_user_tokens >= p_cost THEN
    UPDATE tenant_rate_buckets
    SET tokens_remaining = v_tenant_tokens - p_cost,
        last_refill_at = v_now,
        max_tokens = p_tenant_max_tokens
    WHERE id = v_tenant_row.id;

    UPDATE tenant_rate_buckets
    SET tokens_remaining = v_user_tokens - p_cost,
        last_refill_at = v_now,
        max_tokens = p_user_max_tokens
    WHERE id = v_user_row.id;

    RETURN jsonb_build_object(
      'allowed', true,
      'tenant_remaining', v_tenant_tokens - p_cost,
      'user_remaining', v_user_tokens - p_cost,
      'blocked_by', NULL,
      'retry_after_ms', 0
    );
  END IF;

  -- Keep refill state even on reject, but do not consume.
  UPDATE tenant_rate_buckets
  SET tokens_remaining = v_tenant_tokens,
      last_refill_at = v_now,
      max_tokens = p_tenant_max_tokens
  WHERE id = v_tenant_row.id;

  UPDATE tenant_rate_buckets
  SET tokens_remaining = v_user_tokens,
      last_refill_at = v_now,
      max_tokens = p_user_max_tokens
  WHERE id = v_user_row.id;

  IF v_tenant_tokens < p_cost THEN
    v_retry_after_ms := ((p_refill_interval_sec - MOD(v_tenant_elapsed_sec, p_refill_interval_sec)) * 1000)::INT;
    RETURN jsonb_build_object(
      'allowed', false,
      'tenant_remaining', v_tenant_tokens,
      'user_remaining', v_user_tokens,
      'blocked_by', 'tenant',
      'retry_after_ms', GREATEST(v_retry_after_ms, 0)
    );
  END IF;

  v_retry_after_ms := ((p_refill_interval_sec - MOD(v_user_elapsed_sec, p_refill_interval_sec)) * 1000)::INT;
  RETURN jsonb_build_object(
    'allowed', false,
    'tenant_remaining', v_tenant_tokens,
    'user_remaining', v_user_tokens,
    'blocked_by', 'user',
    'retry_after_ms', GREATEST(v_retry_after_ms, 0)
  );
END;
$$;

COMMENT ON FUNCTION consume_rate_tokens_dual IS
  'Atomic dual-bucket limiter on tenant_rate_buckets: tenant + user all-or-nothing consume.';
