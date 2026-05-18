-- Knowledge claim metric trajectory
-- Adds optional structured metric fields so claims can power temporal trajectories
-- and deterministic entity/founder scorecards without replacing the existing
-- Knowledge Claims model.

ALTER TABLE knowledge_claims
  ADD COLUMN IF NOT EXISTS claim_metric TEXT,
  ADD COLUMN IF NOT EXISTS claim_value DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS claim_unit TEXT,
  ADD COLUMN IF NOT EXISTS claim_period TEXT,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ;

ALTER TABLE knowledge_claims
  DROP CONSTRAINT IF EXISTS knowledge_claims_metric_name_len,
  ADD CONSTRAINT knowledge_claims_metric_name_len
    CHECK (claim_metric IS NULL OR char_length(claim_metric) BETWEEN 1 AND 120);

ALTER TABLE knowledge_claims
  DROP CONSTRAINT IF EXISTS knowledge_claims_metric_unit_len,
  ADD CONSTRAINT knowledge_claims_metric_unit_len
    CHECK (claim_unit IS NULL OR char_length(claim_unit) <= 80);

ALTER TABLE knowledge_claims
  DROP CONSTRAINT IF EXISTS knowledge_claims_metric_period_len,
  ADD CONSTRAINT knowledge_claims_metric_period_len
    CHECK (claim_period IS NULL OR char_length(claim_period) <= 80);

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_metric_trajectory
  ON knowledge_claims(org_id, subject, claim_metric, COALESCE(valid_from, observed_at, created_at), id)
  WHERE claim_metric IS NOT NULL AND claim_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_metric_entity_scope
  ON knowledge_claims(org_id, project_id, team_id, assistant_id, subject, claim_metric)
  WHERE claim_metric IS NOT NULL;

COMMENT ON COLUMN knowledge_claims.claim_metric IS
  'Optional normalized metric name for temporal trajectory and scorecard aggregation.';
COMMENT ON COLUMN knowledge_claims.claim_value IS
  'Optional numeric metric value for temporal trajectory and scorecard aggregation.';
COMMENT ON COLUMN knowledge_claims.claim_unit IS
  'Optional display/semantic unit for claim_value.';
COMMENT ON COLUMN knowledge_claims.claim_period IS
  'Optional period label for the metric value, for example 2026-W20 or 2026-Q2.';
COMMENT ON COLUMN knowledge_claims.observed_at IS
  'Optional observation timestamp when the metric was measured separately from claim creation.';
