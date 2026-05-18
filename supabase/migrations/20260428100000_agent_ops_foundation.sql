-- ============================================================================
-- Agent Ops foundation
--
-- Product-level wrapper around existing Pulse/Nerve/Mission Control storage.
-- This deliberately does NOT create a second workflow engine:
--   - agent_runs remains the low-level execution ledger
--   - orchestration_dags remains the multi-step execution substrate
--   - human_work_items and mc_pending_approvals remain the human gate surfaces
-- Agent Ops adds durable product runs, evidence, findings, and cross-links.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy and optional product scope
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Workflow identity
  workflow_id TEXT NOT NULL,
  workflow_slug TEXT NOT NULL,
  workflow_version TEXT NOT NULL DEFAULT '1.0.0',

  -- Product lifecycle
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'blocked', 'completed', 'failed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low', 'background')),
  safety_mode TEXT NOT NULL DEFAULT 'read_only'
    CHECK (safety_mode IN ('read_only', 'approval_gated', 'write_capable')),

  -- Product-level scope and payloads
  scope_type TEXT NOT NULL,
  scope_ref TEXT,
  scope_label TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  output_sections TEXT[] NOT NULL DEFAULT ARRAY['summary','findings','evidence','risks','next_actions'],

  -- Primary substrate pointers. Additional many-to-many refs live in
  -- agent_ops_run_links so this table stays compact and query-friendly.
  orchestration_dag_id UUID REFERENCES orchestration_dags(id) ON DELETE SET NULL,
  root_agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,

  artifact_count INTEGER NOT NULL DEFAULT 0 CHECK (artifact_count >= 0),
  finding_count INTEGER NOT NULL DEFAULT 0 CHECK (finding_count >= 0),

  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_runs_input_object CHECK (jsonb_typeof(input) = 'object'),
  CONSTRAINT agent_ops_runs_output_object CHECK (output IS NULL OR jsonb_typeof(output) = 'object'),
  CONSTRAINT agent_ops_runs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_runs_org_status
  ON agent_ops_runs(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_runs_org_workflow
  ON agent_ops_runs(org_id, workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_runs_project
  ON agent_ops_runs(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_ops_runs_assistant
  ON agent_ops_runs(assistant_id, created_at DESC)
  WHERE assistant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_ops_runs_dag
  ON agent_ops_runs(orchestration_dag_id)
  WHERE orchestration_dag_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_ops_runs_root_agent_run
  ON agent_ops_runs(root_agent_run_id)
  WHERE root_agent_run_id IS NOT NULL;

ALTER TABLE agent_ops_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_runs_org_select ON agent_ops_runs;
CREATE POLICY agent_ops_runs_org_select ON agent_ops_runs
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_runs_org_insert ON agent_ops_runs;
CREATE POLICY agent_ops_runs_org_insert ON agent_ops_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_runs_service_all ON agent_ops_runs;
CREATE POLICY agent_ops_runs_service_all ON agent_ops_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_agent_ops_runs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_agent_ops_runs_updated_at ON agent_ops_runs;
CREATE TRIGGER touch_agent_ops_runs_updated_at
  BEFORE UPDATE ON agent_ops_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_runs_updated_at();

-- ----------------------------------------------------------------------------
-- Generic link table for all existing execution/gate substrates.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_ops_run_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN (
    'agent_run',
    'orchestration_dag',
    'human_work_item',
    'approval',
    'template_deployment',
    'external'
  )),
  ref_id UUID,
  ref_text TEXT,
  label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_run_links_ref_present CHECK (ref_id IS NOT NULL OR ref_text IS NOT NULL),
  CONSTRAINT agent_ops_run_links_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_run_links_run
  ON agent_ops_run_links(ops_run_id, link_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_run_links_ref_id
  ON agent_ops_run_links(link_type, ref_id)
  WHERE ref_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_run_links_unique_ref_id
  ON agent_ops_run_links(ops_run_id, link_type, ref_id)
  WHERE ref_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_run_links_unique_ref_text
  ON agent_ops_run_links(ops_run_id, link_type, ref_text)
  WHERE ref_text IS NOT NULL;

ALTER TABLE agent_ops_run_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_run_links_org_select ON agent_ops_run_links;
CREATE POLICY agent_ops_run_links_org_select ON agent_ops_run_links
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_run_links_service_all ON agent_ops_run_links;
CREATE POLICY agent_ops_run_links_service_all ON agent_ops_run_links
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- Evidence artifacts projected into Mission Control/replay.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_ops_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'screenshot',
    'console_log',
    'network_log',
    'perf_metric',
    'diff',
    'review_finding',
    'test_result',
    'deploy_url',
    'transcript',
    'model_benchmark',
    'memory_hit',
    'log_excerpt',
    'trace',
    'approval'
  )),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  summary TEXT,
  uri TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT,
  source_kind TEXT,
  source_ref TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_artifacts_content_object CHECK (jsonb_typeof(content) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_artifacts_run
  ON agent_ops_artifacts(ops_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_artifacts_org_type
  ON agent_ops_artifacts(org_id, artifact_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_artifacts_checksum
  ON agent_ops_artifacts(checksum)
  WHERE checksum IS NOT NULL;

ALTER TABLE agent_ops_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_artifacts_org_select ON agent_ops_artifacts;
CREATE POLICY agent_ops_artifacts_org_select ON agent_ops_artifacts
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_artifacts_service_all ON agent_ops_artifacts;
CREATE POLICY agent_ops_artifacts_service_all ON agent_ops_artifacts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.increment_agent_ops_artifact_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE agent_ops_runs
  SET artifact_count = artifact_count + 1
  WHERE id = NEW.ops_run_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_agent_ops_artifact_count ON agent_ops_artifacts;
CREATE TRIGGER increment_agent_ops_artifact_count
  AFTER INSERT ON agent_ops_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.increment_agent_ops_artifact_count();

-- ----------------------------------------------------------------------------
-- Normalized findings. Review, QA, security, canary, and retro all write here.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_ops_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'fixed', 'dismissed', 'needs_info')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  file_path TEXT,
  start_line INTEGER CHECK (start_line IS NULL OR start_line > 0),
  end_line INTEGER CHECK (end_line IS NULL OR end_line > 0),
  confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence_artifact_id UUID REFERENCES agent_ops_artifacts(id) ON DELETE SET NULL,
  fingerprint TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_findings_line_order CHECK (
    start_line IS NULL OR end_line IS NULL OR end_line >= start_line
  ),
  CONSTRAINT agent_ops_findings_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_findings_run
  ON agent_ops_findings(ops_run_id, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_findings_org_status
  ON agent_ops_findings(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_findings_artifact
  ON agent_ops_findings(evidence_artifact_id)
  WHERE evidence_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_findings_unique_fingerprint
  ON agent_ops_findings(ops_run_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

ALTER TABLE agent_ops_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_findings_org_select ON agent_ops_findings;
CREATE POLICY agent_ops_findings_org_select ON agent_ops_findings
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_findings_service_all ON agent_ops_findings;
CREATE POLICY agent_ops_findings_service_all ON agent_ops_findings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_agent_ops_findings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_agent_ops_findings_updated_at ON agent_ops_findings;
CREATE TRIGGER touch_agent_ops_findings_updated_at
  BEFORE UPDATE ON agent_ops_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_findings_updated_at();

CREATE OR REPLACE FUNCTION public.increment_agent_ops_finding_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE agent_ops_runs
  SET finding_count = finding_count + 1
  WHERE id = NEW.ops_run_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_agent_ops_finding_count ON agent_ops_findings;
CREATE TRIGGER increment_agent_ops_finding_count
  AFTER INSERT ON agent_ops_findings
  FOR EACH ROW EXECUTE FUNCTION public.increment_agent_ops_finding_count();
