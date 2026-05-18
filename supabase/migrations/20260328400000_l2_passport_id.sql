-- Add L2 passport ID + status snapshot columns to dedicated_runtimes.
-- L2 Gateway uses passport_id as the URL key for status/logs/terminate.
-- The last_l2_* columns persist a snapshot for debugging, support, and recovery.

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS l2_passport_id TEXT,
  ADD COLUMN IF NOT EXISTS last_l2_status TEXT,
  ADD COLUMN IF NOT EXISTS last_l2_error TEXT,
  ADD COLUMN IF NOT EXISTS last_l2_checked_at TIMESTAMPTZ;

CREATE INDEX idx_runtimes_l2_passport ON dedicated_runtimes (l2_passport_id) WHERE l2_passport_id IS NOT NULL;
