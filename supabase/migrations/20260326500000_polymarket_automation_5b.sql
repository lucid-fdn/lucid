-- Phase 5B: Trusted Auto-Execution + Idempotency + Failure Backoff

-- 1. execution_mode (default 'approval' = backwards compatible)
ALTER TABLE polymarket_automation_rules
  ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'approval'
    CHECK (execution_mode IN ('approval', 'auto_execute'));

-- 2. Failure tracking
ALTER TABLE polymarket_automation_rules
  ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_failed_at TIMESTAMPTZ;

-- 3. Expand execution statuses + add idempotency key
ALTER TABLE polymarket_automation_executions
  DROP CONSTRAINT IF EXISTS polymarket_automation_executions_status_check;
ALTER TABLE polymarket_automation_executions
  ADD CONSTRAINT polymarket_automation_executions_status_check
    CHECK (status IN (
      'pending_approval', 'approved', 'denied', 'expired',
      'executed', 'failed', 'below_minimum',
      'processing',
      'no_position', 'market_unavailable'
    ));

-- Idempotency key: rule_id + trigger fingerprint + cycle window
ALTER TABLE polymarket_automation_executions
  ADD COLUMN execution_key TEXT;

-- Unique constraint on execution_key prevents duplicate trade sends
CREATE UNIQUE INDEX idx_pae_execution_key_dedup
  ON polymarket_automation_executions (execution_key)
  WHERE execution_key IS NOT NULL;

-- Dedup: at most one 'processing' execution per rule
CREATE UNIQUE INDEX idx_pae_processing_dedup
  ON polymarket_automation_executions (rule_id)
  WHERE status = 'processing';

-- 4. Atomic failure increment RPC (avoids read-then-write race)
CREATE OR REPLACE FUNCTION increment_automation_rule_failure(p_rule_id UUID, p_max_failures INTEGER DEFAULT 5)
RETURNS TABLE(new_count INTEGER, auto_disabled BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
  v_auto_disabled BOOLEAN := FALSE;
BEGIN
  UPDATE polymarket_automation_rules
  SET
    consecutive_failures = consecutive_failures + 1,
    last_failed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_rule_id
  RETURNING consecutive_failures INTO v_new_count;

  IF v_new_count IS NULL THEN
    RETURN;
  END IF;

  IF v_new_count >= p_max_failures THEN
    UPDATE polymarket_automation_rules
    SET enabled = FALSE, disabled_reason = 'failures', updated_at = NOW()
    WHERE id = p_rule_id;
    v_auto_disabled := TRUE;
  END IF;

  new_count := v_new_count;
  auto_disabled := v_auto_disabled;
  RETURN NEXT;
END;
$$;
