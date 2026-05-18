-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.749Z.

-- Remote migration version: 20260429180000

-- Remote migration name: agent_ops_review_learnings_evals



-- ============================================================================
-- Agent Ops review army, project learnings, decision preferences, and evals
--
-- Extends Agent Ops without creating a parallel execution engine. These tables
-- are product-level projections around existing Agent Ops runs, artifacts,
-- findings, projects, and org membership.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Review specialist registry. Code owns the canonical built-ins; this table lets
-- orgs add or tune specialists later without changing the Agent Ops run model.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_ops_review_specialists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  category TEXT NOT NULL CHECK (category IN (
    'api',
    'testing',
    'performance',
    'maintainability',
    'migration',
    'security',
    'red_team',
    'devex',
    'accessibility'
  )),
  default_severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (default_severity IN ('info', 'low', 'medium', 'high', 'critical')),
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 4000),
  required_capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_review_specialists_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_review_specialists_builtin_slug
  ON agent_ops_review_specialists(slug)
  WHERE org_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_review_specialists_org_slug
  ON agent_ops_review_specialists(org_id, slug)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_review_specialists_org_active
  ON agent_ops_review_specialists(org_id, is_active, category);

ALTER TABLE agent_ops_review_specialists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_review_specialists_select ON agent_ops_review_specialists;

CREATE POLICY agent_ops_review_specialists_select ON agent_ops_review_specialists
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_review_specialists_service_all ON agent_ops_review_specialists;

CREATE POLICY agent_ops_review_specialists_service_all ON agent_ops_review_specialists
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- Project learnings and timeline. These are separate from assistant memory:
-- they describe project operating knowledge, not personal assistant preference.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  learning_type TEXT NOT NULL CHECK (learning_type IN (
    'pattern',
    'pitfall',
    'preference',
    'architecture',
    'tool',
    'operational',
    'release',
    'security',
    'quality'
  )),
  trust_level TEXT NOT NULL DEFAULT 'observed'
    CHECK (trust_level IN ('user_stated', 'operator_approved', 'observed', 'inferred')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'archived', 'rejected')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  source_kind TEXT NOT NULL DEFAULT 'agent_ops_run'
    CHECK (source_kind IN ('agent_ops_run', 'manual', 'channel', 'repo', 'deploy', 'incident', 'memory')),
  source_ref TEXT,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (confidence >= 0 AND confidence <= 1),
  decay_after TIMESTAMPTZ,
  fingerprint TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT project_learnings_scope_present CHECK (project_id IS NOT NULL OR assistant_id IS NOT NULL),
  CONSTRAINT project_learnings_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_project_learnings_project_active
  ON project_learnings(project_id, status, updated_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_learnings_assistant_active
  ON project_learnings(assistant_id, status, updated_at DESC)
  WHERE assistant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_learnings_org_type
  ON project_learnings(org_id, learning_type, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_learnings_unique_fingerprint
  ON project_learnings(org_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), fingerprint)
  WHERE status = 'active';

ALTER TABLE project_learnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_learnings_org_select ON project_learnings;

CREATE POLICY project_learnings_org_select ON project_learnings
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS project_learnings_org_insert ON project_learnings;

CREATE POLICY project_learnings_org_insert ON project_learnings
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS project_learnings_service_all ON project_learnings;

CREATE POLICY project_learnings_service_all ON project_learnings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS project_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'learning_created',
    'learning_superseded',
    'decision_recorded',
    'eval_completed',
    'release_shipped',
    'incident_investigated',
    'retro_completed'
  )),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT project_timeline_events_evidence_object CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT project_timeline_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_project_timeline_events_project
  ON project_timeline_events(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_timeline_events_run
  ON project_timeline_events(ops_run_id, created_at DESC)
  WHERE ops_run_id IS NOT NULL;

ALTER TABLE project_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_timeline_events_org_select ON project_timeline_events;

CREATE POLICY project_timeline_events_org_select ON project_timeline_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS project_timeline_events_service_all ON project_timeline_events;

CREATE POLICY project_timeline_events_service_all ON project_timeline_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- Decision preferences. Only user/operator-originated preferences should be
-- trusted enough to reduce repeated questions; high-risk decisions still ask.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workspace_decision_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL CHECK (char_length(preference_key) BETWEEN 1 AND 160),
  question_pattern TEXT NOT NULL CHECK (char_length(question_pattern) BETWEEN 1 AND 1000),
  preferred_decision TEXT NOT NULL CHECK (char_length(preferred_decision) BETWEEN 1 AND 1000),
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'one_way_door')),
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'retro', 'operator_approved')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workspace_decision_preferences_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT workspace_decision_preferences_one_way_source CHECK (
    risk_level <> 'one_way_door' OR source_kind = 'operator_approved'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_decision_preferences_key
  ON workspace_decision_preferences(org_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), preference_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_workspace_decision_preferences_project
  ON workspace_decision_preferences(project_id, status, updated_at DESC)
  WHERE project_id IS NOT NULL;

ALTER TABLE workspace_decision_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_decision_preferences_org_select ON workspace_decision_preferences;

CREATE POLICY workspace_decision_preferences_org_select ON workspace_decision_preferences
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS workspace_decision_preferences_org_insert ON workspace_decision_preferences;

CREATE POLICY workspace_decision_preferences_org_insert ON workspace_decision_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS workspace_decision_preferences_service_all ON workspace_decision_preferences;

CREATE POLICY workspace_decision_preferences_service_all ON workspace_decision_preferences
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- Eval Center. Scenarios are reusable; runs/results are attached to Agent Ops,
-- templates, workflows, models, channels, or runtimes through metadata.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_ops_eval_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  workflow_id TEXT,
  target_kind TEXT NOT NULL DEFAULT 'workflow'
    CHECK (target_kind IN ('workflow', 'template', 'model', 'channel', 'runtime', 'memory', 'release')),
  assertion TEXT NOT NULL CHECK (char_length(assertion) BETWEEN 1 AND 2000),
  grader TEXT NOT NULL DEFAULT 'rule'
    CHECK (grader IN ('rule', 'llm_judge', 'human', 'metric')),
  expected JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_eval_scenarios_expected_object CHECK (jsonb_typeof(expected) = 'object'),
  CONSTRAINT agent_ops_eval_scenarios_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_eval_scenarios_builtin_slug
  ON agent_ops_eval_scenarios(slug)
  WHERE org_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_eval_scenarios_org_slug
  ON agent_ops_eval_scenarios(org_id, slug)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_eval_scenarios_workflow
  ON agent_ops_eval_scenarios(workflow_id, is_active)
  WHERE workflow_id IS NOT NULL;

ALTER TABLE agent_ops_eval_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_eval_scenarios_select ON agent_ops_eval_scenarios;

CREATE POLICY agent_ops_eval_scenarios_select ON agent_ops_eval_scenarios
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_eval_scenarios_service_all ON agent_ops_eval_scenarios;

CREATE POLICY agent_ops_eval_scenarios_service_all ON agent_ops_eval_scenarios
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS agent_ops_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  workflow_id TEXT,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('workflow', 'template', 'model', 'channel', 'runtime', 'memory', 'release')),
  target_ref TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  score NUMERIC(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  pass_rate NUMERIC(5,2) CHECK (pass_rate IS NULL OR (pass_rate >= 0 AND pass_rate <= 100)),
  cost_usd NUMERIC(12,6),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  token_count INTEGER CHECK (token_count IS NULL OR token_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_eval_runs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_eval_runs_org_status
  ON agent_ops_eval_runs(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_eval_runs_project
  ON agent_ops_eval_runs(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_eval_runs_ops_run
  ON agent_ops_eval_runs(ops_run_id, created_at DESC)
  WHERE ops_run_id IS NOT NULL;

ALTER TABLE agent_ops_eval_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_eval_runs_org_select ON agent_ops_eval_runs;

CREATE POLICY agent_ops_eval_runs_org_select ON agent_ops_eval_runs
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_eval_runs_org_insert ON agent_ops_eval_runs;

CREATE POLICY agent_ops_eval_runs_org_insert ON agent_ops_eval_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_eval_runs_service_all ON agent_ops_eval_runs;

CREATE POLICY agent_ops_eval_runs_service_all ON agent_ops_eval_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS agent_ops_eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  eval_run_id UUID NOT NULL REFERENCES agent_ops_eval_runs(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES agent_ops_eval_scenarios(id) ON DELETE SET NULL,
  scenario_slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'warning', 'skipped')),
  score NUMERIC(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1000),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_eval_results_evidence_object CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT agent_ops_eval_results_metrics_object CHECK (jsonb_typeof(metrics) = 'object'),
  CONSTRAINT agent_ops_eval_results_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_eval_results_run
  ON agent_ops_eval_results(eval_run_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_eval_results_org
  ON agent_ops_eval_results(org_id, status, created_at DESC);

ALTER TABLE agent_ops_eval_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_eval_results_org_select ON agent_ops_eval_results;

CREATE POLICY agent_ops_eval_results_org_select ON agent_ops_eval_results
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_eval_results_service_all ON agent_ops_eval_results;

CREATE POLICY agent_ops_eval_results_service_all ON agent_ops_eval_results
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Shared updated_at trigger helper for this migration's mutable tables.
CREATE OR REPLACE FUNCTION public.touch_agent_ops_product_layer_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_agent_ops_review_specialists_updated_at ON agent_ops_review_specialists;

CREATE TRIGGER touch_agent_ops_review_specialists_updated_at
  BEFORE UPDATE ON agent_ops_review_specialists
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_product_layer_updated_at();

DROP TRIGGER IF EXISTS touch_project_learnings_updated_at ON project_learnings;

CREATE TRIGGER touch_project_learnings_updated_at
  BEFORE UPDATE ON project_learnings
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_product_layer_updated_at();

DROP TRIGGER IF EXISTS touch_workspace_decision_preferences_updated_at ON workspace_decision_preferences;

CREATE TRIGGER touch_workspace_decision_preferences_updated_at
  BEFORE UPDATE ON workspace_decision_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_product_layer_updated_at();

DROP TRIGGER IF EXISTS touch_agent_ops_eval_scenarios_updated_at ON agent_ops_eval_scenarios;

CREATE TRIGGER touch_agent_ops_eval_scenarios_updated_at
  BEFORE UPDATE ON agent_ops_eval_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_product_layer_updated_at();

DROP TRIGGER IF EXISTS touch_agent_ops_eval_runs_updated_at ON agent_ops_eval_runs;

CREATE TRIGGER touch_agent_ops_eval_runs_updated_at
  BEFORE UPDATE ON agent_ops_eval_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_product_layer_updated_at();
