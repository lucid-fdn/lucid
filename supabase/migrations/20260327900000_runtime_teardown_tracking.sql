-- Migration: Add teardown tracking columns to dedicated_runtimes
-- Supports exponential backoff + alerting for L2 infrastructure teardown.
--
-- The reconciler uses these to:
--   1. Back off retries exponentially (not hammer L2 every 60s forever)
--   2. Alert (Sentry + MC feed) after prolonged teardown failure

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS teardown_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teardown_last_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN dedicated_runtimes.teardown_attempts IS 'Number of L2 teardown attempts. Reset to 0 on success. Used for exponential backoff (60s, 2m, 4m, 8m... capped at 1h).';
COMMENT ON COLUMN dedicated_runtimes.teardown_last_attempt_at IS 'Timestamp of last teardown attempt. Used with teardown_attempts for backoff scheduling.';
