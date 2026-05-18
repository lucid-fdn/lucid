-- Track failed review/promotion attempts so Mission Control can surface
-- backlog health and failed mutation operations.

ALTER TABLE mc_native_mutation_candidates
  ADD COLUMN IF NOT EXISTS review_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS mc_native_mutation_candidates_last_error_at_idx
  ON mc_native_mutation_candidates (org_id, last_error_at DESC)
  WHERE last_error_at IS NOT NULL;
