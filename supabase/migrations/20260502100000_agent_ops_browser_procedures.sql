-- ============================================================================
-- Agent Ops Browser Procedures
--
-- Persistent, governed Browser Operator playbooks inspired by the GStack
-- browser-skill pattern, but modeled as Lucid Agent Ops capabilities:
--   - engine/runtime agnostic
--   - tenant scoped
--   - trust-state governed before runtime replay
--   - linked to Mission Control runs/evidence for provenance
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_browser_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  host_pattern TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  intent_triggers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  procedure_type TEXT NOT NULL DEFAULT 'read_only'
    CHECK (procedure_type IN ('read_only', 'mutating', 'monitoring', 'qa', 'design', 'devex')),
  scope TEXT NOT NULL DEFAULT 'project'
    CHECK (scope IN ('project', 'org', 'global_catalog')),
  trust_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (trust_state IN ('draft', 'quarantined', 'active', 'deprecated', 'blocked')),

  source_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_procedures_host_len CHECK (char_length(host_pattern) BETWEEN 1 AND 255),
  CONSTRAINT agent_ops_browser_procedures_host_no_scheme CHECK (host_pattern NOT LIKE '%://%'),
  CONSTRAINT agent_ops_browser_procedures_name_len CHECK (char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT agent_ops_browser_procedures_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  CONSTRAINT agent_ops_browser_procedures_description_len CHECK (char_length(description) BETWEEN 1 AND 2000),
  CONSTRAINT agent_ops_browser_procedures_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT agent_ops_browser_procedures_scope_project_id CHECK (
    (scope = 'project' AND project_id IS NOT NULL)
    OR (scope IN ('org', 'global_catalog') AND project_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_browser_procedures_project_slug
  ON agent_ops_browser_procedures(org_id, project_id, slug)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_browser_procedures_org_slug
  ON agent_ops_browser_procedures(org_id, slug)
  WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_procedures_org_trust
  ON agent_ops_browser_procedures(org_id, trust_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_procedures_project_trust
  ON agent_ops_browser_procedures(project_id, trust_state, updated_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_procedures_host
  ON agent_ops_browser_procedures(org_id, host_pattern, trust_state);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_procedures_source_run
  ON agent_ops_browser_procedures(source_run_id)
  WHERE source_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_ops_browser_procedure_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  procedure_id UUID NOT NULL REFERENCES agent_ops_browser_procedures(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),

  definition_kind TEXT NOT NULL DEFAULT 'browser_operator_plan'
    CHECK (definition_kind IN ('browser_operator_plan', 'playwright_plan', 'natural_language_playbook')),
  definition JSONB NOT NULL,
  fixture_artifact_id UUID REFERENCES agent_ops_artifacts(id) ON DELETE SET NULL,
  test_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  capabilities TEXT[] NOT NULL DEFAULT ARRAY['tool:browser']::TEXT[],
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  approval_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT NOT NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_procedure_versions_definition_object CHECK (jsonb_typeof(definition) = 'object'),
  CONSTRAINT agent_ops_browser_procedure_versions_test_object CHECK (jsonb_typeof(test_definition) = 'object'),
  CONSTRAINT agent_ops_browser_procedure_versions_approval_object CHECK (jsonb_typeof(approval_policy) = 'object'),
  CONSTRAINT agent_ops_browser_procedure_versions_content_hash_len CHECK (char_length(content_hash) BETWEEN 32 AND 128)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_browser_procedure_versions_version
  ON agent_ops_browser_procedure_versions(procedure_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_browser_procedure_versions_content_hash
  ON agent_ops_browser_procedure_versions(procedure_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_procedure_versions_latest
  ON agent_ops_browser_procedure_versions(procedure_id, version DESC);

CREATE TABLE IF NOT EXISTS agent_ops_browser_procedure_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  procedure_id UUID NOT NULL REFERENCES agent_ops_browser_procedures(id) ON DELETE CASCADE,
  version_id UUID REFERENCES agent_ops_browser_procedure_versions(id) ON DELETE SET NULL,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'blocked', 'handoff_required')),
  matched_trigger TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  security_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_procedure_runs_security_flags_array CHECK (jsonb_typeof(security_flags) = 'array'),
  CONSTRAINT agent_ops_browser_procedure_runs_output_object CHECK (jsonb_typeof(output_summary) = 'object'),
  CONSTRAINT agent_ops_browser_procedure_runs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_browser_procedure_runs_unique_run
  ON agent_ops_browser_procedure_runs(procedure_id, ops_run_id);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_procedure_runs_ops_run
  ON agent_ops_browser_procedure_runs(ops_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_procedure_runs_procedure
  ON agent_ops_browser_procedure_runs(procedure_id, created_at DESC);

ALTER TABLE agent_ops_browser_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_ops_browser_procedure_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_ops_browser_procedure_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_browser_procedures_org_select ON agent_ops_browser_procedures;
CREATE POLICY agent_ops_browser_procedures_org_select ON agent_ops_browser_procedures
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_procedures_org_insert ON agent_ops_browser_procedures;
CREATE POLICY agent_ops_browser_procedures_org_insert ON agent_ops_browser_procedures
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = (SELECT auth.uid())
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_procedures_org_update ON agent_ops_browser_procedures;
CREATE POLICY agent_ops_browser_procedures_org_update ON agent_ops_browser_procedures
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_procedures_service_all ON agent_ops_browser_procedures;
CREATE POLICY agent_ops_browser_procedures_service_all ON agent_ops_browser_procedures
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS agent_ops_browser_procedure_versions_org_select ON agent_ops_browser_procedure_versions;
CREATE POLICY agent_ops_browser_procedure_versions_org_select ON agent_ops_browser_procedure_versions
  FOR SELECT TO authenticated
  USING (
    procedure_id IN (
      SELECT id FROM agent_ops_browser_procedures
      WHERE org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_procedure_versions_org_insert ON agent_ops_browser_procedure_versions;
CREATE POLICY agent_ops_browser_procedure_versions_org_insert ON agent_ops_browser_procedure_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = (SELECT auth.uid())
    AND procedure_id IN (
      SELECT id FROM agent_ops_browser_procedures
      WHERE org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_procedure_versions_service_all ON agent_ops_browser_procedure_versions;
CREATE POLICY agent_ops_browser_procedure_versions_service_all ON agent_ops_browser_procedure_versions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS agent_ops_browser_procedure_runs_org_select ON agent_ops_browser_procedure_runs;
CREATE POLICY agent_ops_browser_procedure_runs_org_select ON agent_ops_browser_procedure_runs
  FOR SELECT TO authenticated
  USING (
    procedure_id IN (
      SELECT id FROM agent_ops_browser_procedures
      WHERE org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_procedure_runs_service_all ON agent_ops_browser_procedure_runs;
CREATE POLICY agent_ops_browser_procedure_runs_service_all ON agent_ops_browser_procedure_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_agent_ops_product_layer_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_agent_ops_browser_procedures_updated_at ON agent_ops_browser_procedures;
CREATE TRIGGER touch_agent_ops_browser_procedures_updated_at
  BEFORE UPDATE ON agent_ops_browser_procedures
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_product_layer_updated_at();
