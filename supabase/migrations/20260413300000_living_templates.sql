-- Living Templates — Phase 1 Migration
-- Extends template_catalog + template_deployments with versioning, cert, and outcome fields.
-- Adds template_evals table for the Phase 2 certification pipeline.
-- Adds memory_config to ai_assistants for the memory schema hint system.

-- =============================================================================
-- template_catalog extensions
-- =============================================================================

ALTER TABLE template_catalog
  ADD COLUMN IF NOT EXISTS version         TEXT    NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS changelog       TEXT,
  ADD COLUMN IF NOT EXISTS forked_from_id  UUID    REFERENCES template_catalog(id),
  ADD COLUMN IF NOT EXISTS forked_from_ver TEXT,
  ADD COLUMN IF NOT EXISTS component_type  TEXT
                                           CHECK (component_type IN ('role','prompt','memory_schema','schedule','approval','eval')),
  ADD COLUMN IF NOT EXISTS cert_status     TEXT    NOT NULL DEFAULT 'uncertified'
                                           CHECK (cert_status IN ('uncertified','experimental','community','verified')),
  ADD COLUMN IF NOT EXISTS cert_score      NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS cert_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_data    JSONB   NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_template_catalog_cert_status
  ON template_catalog (cert_status)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_template_catalog_forked_from
  ON template_catalog (forked_from_id)
  WHERE forked_from_id IS NOT NULL;

-- =============================================================================
-- template_deployments extensions
-- =============================================================================

ALTER TABLE template_deployments
  ADD COLUMN IF NOT EXISTS template_version TEXT,
  ADD COLUMN IF NOT EXISTS activated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_template_deployments_active
  ON template_deployments (template_id, is_active)
  WHERE is_active = TRUE;

-- =============================================================================
-- template_evals (new — Phase 2 certification runner)
-- =============================================================================

CREATE TABLE IF NOT EXISTS template_evals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID        NOT NULL REFERENCES template_catalog(id) ON DELETE CASCADE,
  version      TEXT        NOT NULL,
  scenario     TEXT        NOT NULL,
  result       TEXT        NOT NULL CHECK (result IN ('pass','partial','fail')),
  score        NUMERIC(4,2),
  detail       JSONB,
  run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_evals_template
  ON template_evals (template_id, run_at DESC);

ALTER TABLE template_evals ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read eval results
CREATE POLICY template_evals_select
  ON template_evals FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only service_role can write eval results (from eval runner)
CREATE POLICY template_evals_service
  ON template_evals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- ai_assistants — memory_config column
-- Stores MemorySchemaHint[] from the deployed template spec.
-- Used by the memory pipeline to guide extraction importance thresholds.
-- =============================================================================

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS memory_config JSONB;

COMMENT ON COLUMN ai_assistants.memory_config IS
  'Living template memory schema hints (MemorySchemaHint[]). Guides memory extraction importance thresholds per category.';
