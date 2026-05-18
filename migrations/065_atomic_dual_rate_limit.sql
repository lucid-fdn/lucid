-- Migration 065: Atomic dual-bucket rate limiter RPC
-- Fixes Issue #2 from audit review: two sequential consume_rate_token calls
-- are not atomic together — tenant quota can be burned without allowing request.
--
-- This RPC consumes from BOTH tenant and user buckets in a single transaction.
-- If either bucket rejects, neither is decremented (all-or-nothing).
-- See docs/OPENCLAW_AUDIT_PLAN_V3.md

CREATE OR REPLACE FUNCTION consume_rate_tokens_dual(
  p_tenant_key   TEXT,
  p_user_key     TEXT,
  p_tenant_bucket_key TEXT DEFAULT 'msg_per_min',
  p_user_bucket_key   TEXT DEFAULT 'msg_per_min_user',
  p_cost              INT DEFAULT 1,
  p_tenant_max_tokens INT DEFAULT 20,
  p_user_max_tokens   INT DEFAULT 10,
  p_refill_interval_sec INT DEFAULT 60
) RETURNS JSONB AS $$
DECLARE
  v_now           TIMESTAMPTZ := clock_timestamp();
  v_tenant_row    rate_limit_buckets%ROWTYPE;
  v_user_row      rate_limit_buckets%ROWTYPE;
  v_tenant_tokens NUMERIC;
  v_user_tokens   NUMERIC;
  v_tenant_ok     BOOLEAN;
  v_user_ok       BOOLEAN;
  v_refill_rate   NUMERIC;
  v_elapsed_sec   NUMERIC;
  v_retry_after   NUMERIC := 0;
BEGIN
  -- ─── TENANT BUCKET: Upsert + refill ───
  INSERT INTO rate_limit_buckets (tenant_id, bucket_key, tokens, max_tokens, refill_interval_sec, last_refill)
  VALUES (p_tenant_key, p_tenant_bucket_key, p_tenant_max_tokens, p_tenant_max_tokens, p_refill_interval_sec, v_now)
  ON CONFLICT (tenant_id, bucket_key) DO NOTHING;

  SELECT * INTO v_tenant_row
  FROM rate_limit_buckets
  WHERE tenant_id = p_tenant_key AND bucket_key = p_tenant_bucket_key
  FOR UPDATE;  -- row lock

  v_refill_rate := v_tenant_row.max_tokens::NUMERIC / v_tenant_row.refill_interval_sec;
  v_elapsed_sec := EXTRACT(EPOCH FROM (v_now - v_tenant_row.last_refill));
  v_tenant_tokens := LEAST(v_tenant_row.max_tokens, v_tenant_row.tokens + (v_elapsed_sec * v_refill_rate));
  v_tenant_ok := v_tenant_tokens >= p_cost;

  -- ─── USER BUCKET: Upsert + refill ───
  INSERT INTO rate_limit_buckets (tenant_id, bucket_key, tokens, max_tokens, refill_interval_sec, last_refill)
  VALUES (p_user_key, p_user_bucket_key, p_user_max_tokens, p_user_max_tokens, p_refill_interval_sec, v_now)
  ON CONFLICT (tenant_id, bucket_key) DO NOTHING;

  SELECT * INTO v_user_row
  FROM rate_limit_buckets
  WHERE tenant_id = p_user_key AND bucket_key = p_user_bucket_key
  FOR UPDATE;  -- row lock

  v_refill_rate := v_user_row.max_tokens::NUMERIC / v_user_row.refill_interval_sec;
  v_elapsed_sec := EXTRACT(EPOCH FROM (v_now - v_user_row.last_refill));
  v_user_tokens := LEAST(v_user_row.max_tokens, v_user_row.tokens + (v_elapsed_sec * v_refill_rate));
  v_user_ok := v_user_tokens >= p_cost;

  -- ─── ALL-OR-NOTHING: Only decrement both if BOTH allow ───
  IF v_tenant_ok AND v_user_ok THEN
    UPDATE rate_limit_buckets
    SET tokens = v_tenant_tokens - p_cost, last_refill = v_now
    WHERE tenant_id = p_tenant_key AND bucket_key = p_tenant_bucket_key;

    UPDATE rate_limit_buckets
    SET tokens = v_user_tokens - p_cost, last_refill = v_now
    WHERE tenant_id = p_user_key AND bucket_key = p_user_bucket_key;

    RETURN jsonb_build_object(
      'allowed', true,
      'tenant_remaining', (v_tenant_tokens - p_cost)::INT,
      'user_remaining', (v_user_tokens - p_cost)::INT,
      'blocked_by', NULL,
      'retry_after_ms', 0
    );
  ELSE
    -- Compute retry_after from the blocking bucket
    IF NOT v_tenant_ok THEN
      v_retry_after := GREATEST(0, ((p_cost - v_tenant_tokens) / (v_tenant_row.max_tokens::NUMERIC / v_tenant_row.refill_interval_sec))) * 1000;
    ELSE
      v_retry_after := GREATEST(0, ((p_cost - v_user_tokens) / (v_user_row.max_tokens::NUMERIC / v_user_row.refill_interval_sec))) * 1000;
    END IF;

    -- Update refill timestamps without consuming (to keep token math correct)
    UPDATE rate_limit_buckets
    SET tokens = v_tenant_tokens, last_refill = v_now
    WHERE tenant_id = p_tenant_key AND bucket_key = p_tenant_bucket_key;

    UPDATE rate_limit_buckets
    SET tokens = v_user_tokens, last_refill = v_now
    WHERE tenant_id = p_user_key AND bucket_key = p_user_bucket_key;

    RETURN jsonb_build_object(
      'allowed', false,
      'tenant_remaining', v_tenant_tokens::INT,
      'user_remaining', v_user_tokens::INT,
      'blocked_by', CASE WHEN NOT v_tenant_ok THEN 'tenant' ELSE 'user' END,
      'retry_after_ms', v_retry_after::INT
    );
  END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION consume_rate_tokens_dual IS
  'Atomic dual-bucket rate limiter: consumes from tenant + user buckets in one transaction. All-or-nothing semantics. See OPENCLAW_AUDIT_PLAN_V3.md Issue #2';