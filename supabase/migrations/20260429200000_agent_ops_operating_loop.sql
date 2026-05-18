-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.754Z.

-- Remote migration version: 20260429200000

-- Remote migration name: agent_ops_operating_loop



-- ============================================================================
-- Agent Ops Phase 8 operating loop
--
-- Durable context snapshots and project safety policies. These are product-level
-- Agent Ops primitives, not runtime-specific memory or template records.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  snapshot_kind TEXT NOT NULL DEFAULT 'checkpoint'
    CHECK (snapshot_kind IN ('handoff', 'resume', 'checkpoint', 'retro', 'release')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 2000),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_context_snapshots_state_object CHECK (jsonb_typeof(state) = 'object'),
  CONSTRAINT agent_ops_context_snapshots_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_context_snapshots_org_created
  ON agent_ops_context_snapshots(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_context_snapshots_project_created
  ON agent_ops_context_snapshots(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_context_snapshots_ops_run
  ON agent_ops_context_snapshots(ops_run_id, created_at DESC)
  WHERE ops_run_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_context_snapshots_fingerprint
  ON agent_ops_context_snapshots(org_id, fingerprint);

ALTER TABLE agent_ops_context_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_context_snapshots_org_select ON agent_ops_context_snapshots;

CREATE POLICY agent_ops_context_snapshots_org_select ON agent_ops_context_snapshots
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_context_snapshots_service_all ON agent_ops_context_snapshots;

CREATE POLICY agent_ops_context_snapshots_service_all ON agent_ops_context_snapshots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS agent_ops_project_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_key TEXT GENERATED ALWAYS AS (COALESCE(project_id::text, 'org')) STORED,
  safety_mode TEXT NOT NULL DEFAULT 'normal'
    CHECK (safety_mode IN ('normal', 'careful', 'guard', 'freeze', 'canary')),
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_project_policies_policy_object CHECK (jsonb_typeof(policy) = 'object'),
  CONSTRAINT agent_ops_project_policies_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_project_policies_identity
  ON agent_ops_project_policies(org_id, project_key, status);

CREATE INDEX IF NOT EXISTS idx_agent_ops_project_policies_org
  ON agent_ops_project_policies(org_id, status, updated_at DESC);

ALTER TABLE agent_ops_project_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_project_policies_org_select ON agent_ops_project_policies;

CREATE POLICY agent_ops_project_policies_org_select ON agent_ops_project_policies
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_project_policies_service_all ON agent_ops_project_policies;

CREATE POLICY agent_ops_project_policies_service_all ON agent_ops_project_policies
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
