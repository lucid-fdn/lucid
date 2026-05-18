-- ============================================================================
-- mc_native_mutation_candidates review / promotion lifecycle
-- ============================================================================

ALTER TABLE mc_native_mutation_candidates
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'promoted')),
  ADD COLUMN IF NOT EXISTS promotion_scope TEXT
    CHECK (promotion_scope IN ('assistant_durable', 'org_durable')),
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_record_id TEXT,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_mc_native_mutation_candidates_status_created
  ON mc_native_mutation_candidates(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_native_mutation_candidates_agent_status_created
  ON mc_native_mutation_candidates(agent_id, status, created_at DESC);
