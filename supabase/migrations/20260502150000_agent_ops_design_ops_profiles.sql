-- ============================================================================
-- Agent Ops Design Ops + Operator Profiles
--
-- Transparent, tenant-scoped taste/developer/communication/release profiles and
-- Design Ops feedback capture. These are read models around Agent Ops evidence;
-- they do not create a separate execution engine.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_operator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL,
  profile_type TEXT NOT NULL
    CHECK (profile_type IN ('developer', 'design_taste', 'communication', 'release')),

  declared JSONB NOT NULL DEFAULT '{}'::jsonb,
  inferred JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  decay_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_operator_profiles_declared_object CHECK (jsonb_typeof(declared) = 'object'),
  CONSTRAINT agent_ops_operator_profiles_inferred_object CHECK (jsonb_typeof(inferred) = 'object'),
  CONSTRAINT agent_ops_operator_profiles_confidence_object CHECK (jsonb_typeof(confidence) = 'object'),
  CONSTRAINT agent_ops_operator_profiles_decay_object CHECK (jsonb_typeof(decay_policy) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_operator_profiles_scope
  ON agent_ops_operator_profiles(org_id, scope_key, profile_type);

CREATE INDEX IF NOT EXISTS idx_agent_ops_operator_profiles_org_project
  ON agent_ops_operator_profiles(org_id, project_id, profile_type, updated_at DESC);

ALTER TABLE agent_ops_operator_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_operator_profiles_org_select ON agent_ops_operator_profiles;
CREATE POLICY agent_ops_operator_profiles_org_select ON agent_ops_operator_profiles
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_operator_profiles_service_all ON agent_ops_operator_profiles;
CREATE POLICY agent_ops_operator_profiles_service_all ON agent_ops_operator_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS agent_ops_design_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  artifact_id UUID REFERENCES agent_ops_artifacts(id) ON DELETE SET NULL,

  variant_key TEXT NOT NULL CHECK (char_length(variant_key) BETWEEN 1 AND 160),
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('approval', 'rejection', 'preference', 'note')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'promoted')),
  feedback TEXT,
  source TEXT NOT NULL DEFAULT 'agent'
    CHECK (source IN ('operator', 'agent', 'eval', 'imported')),
  fingerprint TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_design_feedback_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_design_feedback_fingerprint
  ON agent_ops_design_feedback(org_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_agent_ops_design_feedback_project
  ON agent_ops_design_feedback(org_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_design_feedback_run
  ON agent_ops_design_feedback(org_id, ops_run_id, created_at DESC);

ALTER TABLE agent_ops_design_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_design_feedback_org_select ON agent_ops_design_feedback;
CREATE POLICY agent_ops_design_feedback_org_select ON agent_ops_design_feedback
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_design_feedback_service_all ON agent_ops_design_feedback;
CREATE POLICY agent_ops_design_feedback_service_all ON agent_ops_design_feedback
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
