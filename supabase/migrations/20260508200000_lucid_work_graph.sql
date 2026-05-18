-- ============================================================================
-- Lucid Work Graph — Goals, Boards, PM Dependencies, Checkouts, and Links
--
-- Additive product semantics layer over:
--   - human_work_items for canonical work item rows
--   - work_item_external_refs for PM provider mirrors
--   - agent_ops_* tables for execution evidence
--   - knowledge_* tables for semantic memory/evidence
--   - orchestration_dags for scheduler/runtime execution graphs
--
-- Work Graph centralizes PM/product state. It does not duplicate provider
-- clients, execution evidence, Knowledge claims, DAG scheduler state, or
-- engine-home storage.
-- ============================================================================

CREATE OR REPLACE FUNCTION work_graph_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Goals
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_goal_id UUID REFERENCES work_goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'blocked', 'at_risk', 'done', 'cancelled', 'archived')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  source TEXT NOT NULL DEFAULT 'lucid'
    CHECK (source IN ('lucid', 'builder', 'agent_ops', 'external_pm', 'import', 'system')),
  target_date TIMESTAMPTZ,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  rollup JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rollup) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT work_goals_no_self_parent CHECK (parent_goal_id IS NULL OR parent_goal_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_work_goals_org_project_status
  ON work_goals(org_id, project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_goals_parent
  ON work_goals(parent_goal_id)
  WHERE parent_goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_goals_owner_user
  ON work_goals(org_id, owner_user_id, status)
  WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_goals_owner_agent
  ON work_goals(org_id, owner_agent_id, status)
  WHERE owner_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_goals_metadata_gin
  ON work_goals USING GIN(metadata);

DROP TRIGGER IF EXISTS work_goals_updated_at ON work_goals;
CREATE TRIGGER work_goals_updated_at
  BEFORE UPDATE ON work_goals
  FOR EACH ROW EXECUTE FUNCTION work_graph_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Goal to work item links
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_item_goal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES work_goals(id) ON DELETE CASCADE,
  work_item_id UUID NOT NULL REFERENCES human_work_items(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (link_type IN ('primary', 'supporting', 'evidence')),
  weight NUMERIC NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_item_goal_links_unique
  ON work_item_goal_links(goal_id, work_item_id, link_type);
CREATE INDEX IF NOT EXISTS idx_work_item_goal_links_goal
  ON work_item_goal_links(org_id, goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_item_goal_links_item
  ON work_item_goal_links(org_id, work_item_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- PM-level work item relations. These are not orchestration DAG edges.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_item_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_work_item_id UUID NOT NULL REFERENCES human_work_items(id) ON DELETE CASCADE,
  target_work_item_id UUID NOT NULL REFERENCES human_work_items(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL
    CHECK (relation_type IN ('blocks', 'blocked_by', 'depends_on', 'parent', 'child', 'duplicate_of', 'relates_to')),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT work_item_relations_no_self CHECK (source_work_item_id <> target_work_item_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_item_relations_unique
  ON work_item_relations(source_work_item_id, target_work_item_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_work_item_relations_source
  ON work_item_relations(org_id, source_work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_item_relations_target
  ON work_item_relations(org_id, target_work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_item_relations_type
  ON work_item_relations(org_id, relation_type, created_at DESC);

-- ----------------------------------------------------------------------------
-- Boards, columns, and item ranks. Kanban is one projection of Work Graph.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES work_goals(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 240),
  kind TEXT NOT NULL DEFAULT 'kanban'
    CHECK (kind IN ('kanban', 'roadmap', 'goal', 'external_mirror')),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
  source TEXT NOT NULL DEFAULT 'lucid'
    CHECK (source IN ('lucid', 'linear', 'asana', 'trello', 'monday', 'jira')),
  external_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(external_config) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_work_boards_org_project_kind
  ON work_boards(org_id, project_id, kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_boards_goal
  ON work_boards(org_id, goal_id, updated_at DESC)
  WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_boards_scope_gin
  ON work_boards USING GIN(scope);

DROP TRIGGER IF EXISTS work_boards_updated_at ON work_boards;
CREATE TRIGGER work_boards_updated_at
  BEFORE UPDATE ON work_boards
  FOR EACH ROW EXECUTE FUNCTION work_graph_touch_updated_at();

CREATE TABLE IF NOT EXISTS work_board_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES work_boards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  status_filter TEXT[] NOT NULL DEFAULT '{}',
  position NUMERIC NOT NULL DEFAULT 0,
  wip_limit INTEGER CHECK (wip_limit IS NULL OR wip_limit > 0),
  color TEXT CHECK (color IS NULL OR char_length(color) <= 80),
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  external_mapping JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(external_mapping) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, key)
);

CREATE INDEX IF NOT EXISTS idx_work_board_columns_board_position
  ON work_board_columns(board_id, position);

DROP TRIGGER IF EXISTS work_board_columns_updated_at ON work_board_columns;
CREATE TRIGGER work_board_columns_updated_at
  BEFORE UPDATE ON work_board_columns
  FOR EACH ROW EXECUTE FUNCTION work_graph_touch_updated_at();

CREATE TABLE IF NOT EXISTS work_board_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES work_boards(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES work_board_columns(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_item_id UUID NOT NULL REFERENCES human_work_items(id) ON DELETE CASCADE,
  rank TEXT NOT NULL CHECK (char_length(rank) BETWEEN 1 AND 120),
  swimlane_key TEXT CHECK (swimlane_key IS NULL OR char_length(swimlane_key) <= 160),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, work_item_id)
);

CREATE INDEX IF NOT EXISTS idx_work_board_items_column_rank
  ON work_board_items(column_id, rank);
CREATE INDEX IF NOT EXISTS idx_work_board_items_work_item
  ON work_board_items(org_id, work_item_id);

DROP TRIGGER IF EXISTS work_board_items_updated_at ON work_board_items;
CREATE TRIGGER work_board_items_updated_at
  BEFORE UPDATE ON work_board_items
  FOR EACH ROW EXECUTE FUNCTION work_graph_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Product-level checkout/ownership. Coordinates with existing locks/leases.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_item_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  work_item_id UUID NOT NULL REFERENCES human_work_items(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL
    CHECK (owner_kind IN ('user', 'agent', 'team', 'external_pm', 'system')),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  owner_team_id UUID REFERENCES crews(id) ON DELETE SET NULL,
  external_owner_ref TEXT CHECK (external_owner_ref IS NULL OR char_length(external_owner_ref) <= 300),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'expired', 'cancelled', 'completed')),
  purpose TEXT NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 500),
  lease_expires_at TIMESTAMPTZ,
  agent_ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL,
  required_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_capabilities) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  CONSTRAINT work_item_checkouts_owner_present CHECK (
    (owner_kind = 'user' AND owner_user_id IS NOT NULL)
    OR (owner_kind = 'agent' AND owner_agent_id IS NOT NULL)
    OR (owner_kind = 'team' AND owner_team_id IS NOT NULL)
    OR (owner_kind = 'external_pm' AND external_owner_ref IS NOT NULL)
    OR (owner_kind = 'system')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_item_checkouts_one_active
  ON work_item_checkouts(work_item_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_work_item_checkouts_org_status
  ON work_item_checkouts(org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_item_checkouts_expiry
  ON work_item_checkouts(lease_expires_at)
  WHERE status = 'active' AND lease_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_item_checkouts_agent_run
  ON work_item_checkouts(agent_ops_run_id)
  WHERE agent_ops_run_id IS NOT NULL;

DROP TRIGGER IF EXISTS work_item_checkouts_updated_at ON work_item_checkouts;
CREATE TRIGGER work_item_checkouts_updated_at
  BEFORE UPDATE ON work_item_checkouts
  FOR EACH ROW EXECUTE FUNCTION work_graph_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Lightweight artifact/evidence links. Authoritative content lives elsewhere.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_artifact_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES work_goals(id) ON DELETE CASCADE,
  work_item_id UUID REFERENCES human_work_items(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL
    CHECK (artifact_type IN (
      'agent_ops_run', 'agent_ops_artifact', 'agent_ops_finding', 'agent_run',
      'approval', 'knowledge_claim', 'knowledge_page', 'browser_session',
      'ehv_snapshot', 'file', 'url', 'external_pm_ref', 'test_result',
      'screenshot', 'diff', 'note'
    )),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 240),
  url TEXT CHECK (url IS NULL OR char_length(url) <= 2000),
  ref_table TEXT CHECK (
    ref_table IS NULL OR ref_table IN (
      'agent_ops_runs', 'agent_ops_artifacts', 'agent_ops_findings',
      'knowledge_claims', 'knowledge_pages', 'browser_operator_sessions',
      'engine_home_snapshots', 'work_item_external_refs', 'mc_pending_approvals',
      'agent_runs'
    )
  ),
  ref_id TEXT CHECK (ref_id IS NULL OR char_length(ref_id) <= 300),
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 2000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT work_artifact_links_owner_present CHECK (goal_id IS NOT NULL OR work_item_id IS NOT NULL),
  CONSTRAINT work_artifact_links_pointer_present CHECK (
    url IS NOT NULL OR (ref_table IS NOT NULL AND ref_id IS NOT NULL) OR metadata ? 'external_ref'
  )
);

CREATE INDEX IF NOT EXISTS idx_work_artifact_links_item
  ON work_artifact_links(org_id, work_item_id, created_at DESC)
  WHERE work_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_artifact_links_goal
  ON work_artifact_links(org_id, goal_id, created_at DESC)
  WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_artifact_links_type
  ON work_artifact_links(org_id, artifact_type, created_at DESC);

-- ----------------------------------------------------------------------------
-- Work Graph audit feed. Keeps PM graph events separate from project timeline.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_graph_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES work_goals(id) ON DELETE SET NULL,
  work_item_id UUID REFERENCES human_work_items(id) ON DELETE SET NULL,
  actor_kind TEXT NOT NULL
    CHECK (actor_kind IN ('user', 'agent', 'system', 'external_sync', 'ai_planner')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  actor_external_provider TEXT
    CHECK (actor_external_provider IS NULL OR actor_external_provider IN ('lucid', 'linear', 'asana', 'trello', 'monday', 'jira')),
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 160),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 51200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_graph_events_project
  ON work_graph_events(org_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_graph_events_goal
  ON work_graph_events(org_id, goal_id, created_at DESC)
  WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_graph_events_item
  ON work_graph_events(org_id, work_item_id, created_at DESC)
  WHERE work_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_graph_events_type
  ON work_graph_events(org_id, event_type, created_at DESC);

-- ----------------------------------------------------------------------------
-- Engine/runtime facets. Optional capability-linked PM metadata, not engine home.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_item_engine_facets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  work_item_id UUID NOT NULL REFERENCES human_work_items(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (char_length(engine) BETWEEN 1 AND 80),
  runtime_flavor TEXT CHECK (runtime_flavor IS NULL OR runtime_flavor IN ('shared', 'dedicated', 'byo')),
  facet_key TEXT NOT NULL CHECK (char_length(facet_key) BETWEEN 1 AND 160),
  facet_state JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(facet_state) = 'object'),
  source_runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL,
  source_snapshot_id UUID,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_item_id, engine, facet_key)
);

CREATE INDEX IF NOT EXISTS idx_work_item_engine_facets_item
  ON work_item_engine_facets(org_id, work_item_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_item_engine_facets_engine
  ON work_item_engine_facets(org_id, engine, facet_key, updated_at DESC);

DROP TRIGGER IF EXISTS work_item_engine_facets_updated_at ON work_item_engine_facets;
CREATE TRIGGER work_item_engine_facets_updated_at
  BEFORE UPDATE ON work_item_engine_facets
  FOR EACH ROW EXECUTE FUNCTION work_graph_touch_updated_at();

-- ----------------------------------------------------------------------------
-- AI planning/decomposition jobs. Proposals require review before commit.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_graph_planning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES work_goals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'needs_review', 'committed', 'failed', 'cancelled')),
  source TEXT NOT NULL
    CHECK (source IN ('goal_create', 'builder', 'board_action', 'external_import', 'agent_ops')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input) = 'object'),
  proposal JSONB CHECK (proposal IS NULL OR jsonb_typeof(proposal) = 'object'),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  model_policy JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(model_policy) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_graph_planning_jobs_project
  ON work_graph_planning_jobs(org_id, project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_graph_planning_jobs_goal
  ON work_graph_planning_jobs(org_id, goal_id, created_at DESC)
  WHERE goal_id IS NOT NULL;

DROP TRIGGER IF EXISTS work_graph_planning_jobs_updated_at ON work_graph_planning_jobs;
CREATE TRIGGER work_graph_planning_jobs_updated_at
  BEFORE UPDATE ON work_graph_planning_jobs
  FOR EACH ROW EXECUTE FUNCTION work_graph_touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE work_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_item_goal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_item_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_board_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_item_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_artifact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_graph_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_item_engine_facets ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_graph_planning_jobs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'work_goals',
    'work_item_goal_links',
    'work_item_relations',
    'work_boards',
    'work_board_columns',
    'work_board_items',
    'work_item_checkouts',
    'work_artifact_links',
    'work_graph_events',
    'work_item_engine_facets',
    'work_graph_planning_jobs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_org_isolation ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_org_isolation ON %I FOR ALL TO authenticated USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())) WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))',
      table_name,
      table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON %I', table_name, table_name);
    EXECUTE format('CREATE POLICY %I_service_all ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name, table_name);
  END LOOP;
END $$;

COMMENT ON TABLE work_goals IS
  'Durable PM goal hierarchy for the Lucid Work Graph. Seeded by Builder objectives and external PM imports but owned by Lucid product semantics.';
COMMENT ON TABLE work_item_goal_links IS
  'Links canonical human_work_items to Work Graph goals without replacing the human work ledger.';
COMMENT ON TABLE work_item_relations IS
  'PM-level blockers/dependencies between work items. These are intentionally separate from orchestration DAG edges.';
COMMENT ON TABLE work_boards IS
  'Persisted PM board projections such as Kanban. This is not workflow canvas storage or org_board_memory.';
COMMENT ON TABLE work_item_checkouts IS
  'Product-level work ownership/checkout state that coordinates with existing claims, locks, and Agent Ops runs.';
COMMENT ON TABLE work_artifact_links IS
  'Lightweight links to authoritative evidence in Agent Ops, Knowledge, Browser Operator, EHV, external PM tools, files, URLs, or tests.';
COMMENT ON TABLE work_graph_events IS
  'Append-only Work Graph audit feed for graph/board/planning changes. Project timeline summaries are emitted separately.';
COMMENT ON TABLE work_item_engine_facets IS
  'Optional runtime/engine-specific work item metadata keyed by capabilities, not a replacement for EHV/HHV/OHV.';
COMMENT ON TABLE work_graph_planning_jobs IS
  'AI-assisted goal decomposition and planning proposals. Commit path must revalidate before writing Work Graph state.';

