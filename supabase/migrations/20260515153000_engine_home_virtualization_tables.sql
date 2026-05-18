-- Engine Home Virtualization persistence.
--
-- These tables are the durable review/audit spine for HHV/OHV. Runtime
-- adapters can push snapshots and mutation candidates, while Lucid keeps the
-- approval, export, rollback, and Work Graph linking experience centralized.

CREATE TABLE IF NOT EXISTS engine_home_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL,
  engine TEXT NOT NULL CHECK (char_length(engine) BETWEEN 1 AND 80),
  runtime_flavor TEXT CHECK (runtime_flavor IN ('shared', 'c1_managed', 'c2a_autonomous')),
  home_id TEXT NOT NULL CHECK (char_length(home_id) BETWEEN 1 AND 240),
  root_digest TEXT NOT NULL CHECK (root_digest ~ '^[a-f0-9]{64}$'),
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  archive_ref JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT engine_home_snapshots_manifest_object CHECK (jsonb_typeof(manifest) = 'object'),
  CONSTRAINT engine_home_snapshots_archive_ref_object CHECK (archive_ref IS NULL OR jsonb_typeof(archive_ref) = 'object'),
  CONSTRAINT engine_home_snapshots_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_engine_home_snapshots_home_digest
  ON engine_home_snapshots(home_id, root_digest);

CREATE INDEX IF NOT EXISTS idx_engine_home_snapshots_org_agent_created
  ON engine_home_snapshots(org_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_home_snapshots_runtime_created
  ON engine_home_snapshots(runtime_id, created_at DESC)
  WHERE runtime_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS engine_home_diff_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('shared', 'relay', 'native')),
  engine TEXT NOT NULL CHECK (char_length(engine) BETWEEN 1 AND 80),
  runtime_flavor TEXT NOT NULL CHECK (runtime_flavor IN ('shared', 'c1_managed', 'c2a_autonomous')),
  home_id TEXT NOT NULL CHECK (char_length(home_id) BETWEEN 1 AND 240),
  before_snapshot_id UUID REFERENCES engine_home_snapshots(id) ON DELETE SET NULL,
  after_snapshot_id UUID REFERENCES engine_home_snapshots(id) ON DELETE SET NULL,
  before_digest TEXT CHECK (before_digest IS NULL OR before_digest ~ '^[a-f0-9]{64}$'),
  after_digest TEXT CHECK (after_digest IS NULL OR after_digest ~ '^[a-f0-9]{64}$'),
  diff JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'promoted', 'expired')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT engine_home_diff_candidates_diff_object CHECK (jsonb_typeof(diff) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_engine_home_diff_candidates_org_agent_status
  ON engine_home_diff_candidates(org_id, agent_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_home_diff_candidates_runtime_created
  ON engine_home_diff_candidates(runtime_id, created_at DESC)
  WHERE runtime_id IS NOT NULL;

ALTER TABLE engine_home_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_home_diff_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engine_home_snapshots_org_select ON engine_home_snapshots;
CREATE POLICY engine_home_snapshots_org_select ON engine_home_snapshots
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS engine_home_snapshots_service_all ON engine_home_snapshots;
CREATE POLICY engine_home_snapshots_service_all ON engine_home_snapshots
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS engine_home_diff_candidates_org_select ON engine_home_diff_candidates;
CREATE POLICY engine_home_diff_candidates_org_select ON engine_home_diff_candidates
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS engine_home_diff_candidates_service_all ON engine_home_diff_candidates;
CREATE POLICY engine_home_diff_candidates_service_all ON engine_home_diff_candidates
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE engine_home_snapshots IS
  'Engine Home Virtualization snapshots for Hermes/OpenClaw home state across shared, dedicated, and BYO runtimes.';

COMMENT ON TABLE engine_home_diff_candidates IS
  'Reviewable Engine Home mutation/diff/rollback candidates produced by runtime adapters, EHV routines, or operator actions.';
