-- Phase 4N-a, Task 16: DAG Planner core tables
--
-- Creates the 6 tables that back `worker/src/pulse/dag/` (Nerve DAG Planner).
-- See docs/superpowers/specs/2026-04-06-nerve-dag-planner-design.md §3.1-§3.6.
--
-- Design invariants locked by Codex review:
--   - Counter-driven readiness (pending_parent_count) — no whole-graph scans
--   - Composite UNIQUE(dag_id, id) on nodes so edges FK enforces same-DAG integrity
--   - graph_version for optimistic concurrency on mutations
--   - Org-scoped RLS on every table

-- ============================================================================
-- 3.1 orchestration_dags — DAG instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration_dags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,

  -- Origin
  source TEXT NOT NULL CHECK (source IN ('template', 'agent_authored', 'hybrid')),
  template_id UUID,  -- FK added after orchestration_dag_templates exists (below)
  root_event_id UUID,
  root_event_type TEXT CHECK (root_event_type IN ('inbound','outbound','scheduled','webhook')),

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','blocked','paused','completed','failed','cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Concurrency control (Codex Blocker #3)
  graph_version INTEGER NOT NULL DEFAULT 1,

  -- Counters for fast progress reads (Codex Blocker #2)
  total_nodes INTEGER NOT NULL DEFAULT 0,
  completed_nodes INTEGER NOT NULL DEFAULT 0,
  failed_nodes INTEGER NOT NULL DEFAULT 0,
  ready_nodes INTEGER NOT NULL DEFAULT 0,

  -- Budget snapshot (frozen at creation; live consumption in budget_events)
  budget_max_tokens INTEGER,
  budget_max_usd NUMERIC(10,4),
  budget_max_wall_seconds INTEGER,
  budget_max_tool_calls INTEGER,

  -- Replay
  replay_of_dag_id UUID REFERENCES orchestration_dags(id),
  replay_from_node_id UUID,  -- FK added after orchestration_dag_nodes exists

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orch_dags_agent
  ON orchestration_dags(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_dags_status
  ON orchestration_dags(status)
  WHERE status IN ('pending','running','blocked','paused');
CREATE INDEX IF NOT EXISTS idx_orch_dags_org
  ON orchestration_dags(org_id, created_at DESC);

ALTER TABLE orchestration_dags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orchestration_dags_org_isolation ON orchestration_dags;
CREATE POLICY orchestration_dags_org_isolation ON orchestration_dags
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- ============================================================================
-- 3.2 orchestration_dag_nodes — Graph nodes
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration_dag_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id UUID NOT NULL REFERENCES orchestration_dags(id) ON DELETE CASCADE,

  -- Node identity
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN (
    'leaf', 'group', 'barrier', 'expansion_zone', 'approval'
  )),

  -- Execution target (only for leaf nodes)
  step_type TEXT,
  runtime_target TEXT,
  route_class TEXT,
  payload JSONB,

  -- Confidence contract (Phase 5N pre-wire)
  confidence_floor NUMERIC(3,2),
  confidence_observed NUMERIC(3,2),
  confidence_source TEXT CHECK (confidence_source IN ('static','router','self_report')),

  -- Readiness counter (kills whole-graph scans)
  pending_parent_count INTEGER NOT NULL DEFAULT 0,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','running','completed','failed','skipped','superseded','cancelled')),
  step_id UUID REFERENCES orchestration_steps(id),
  superseded_at TIMESTAMPTZ,
  superseded_by_node_id UUID REFERENCES orchestration_dag_nodes(id),

  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (dag_id, node_key),
  -- Composite key enables cross-DAG integrity FK on edges (Codex Blocker #1)
  UNIQUE (dag_id, id)
);

CREATE INDEX IF NOT EXISTS idx_dag_nodes_dag_status
  ON orchestration_dag_nodes(dag_id, status);
CREATE INDEX IF NOT EXISTS idx_dag_nodes_ready
  ON orchestration_dag_nodes(dag_id) WHERE status = 'ready';
CREATE INDEX IF NOT EXISTS idx_dag_nodes_pending
  ON orchestration_dag_nodes(dag_id) WHERE pending_parent_count > 0 AND status = 'pending';

ALTER TABLE orchestration_dag_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orchestration_dag_nodes_org_isolation ON orchestration_dag_nodes;
CREATE POLICY orchestration_dag_nodes_org_isolation ON orchestration_dag_nodes
  FOR ALL TO authenticated
  USING (dag_id IN (
    SELECT id FROM orchestration_dags
    WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ));

-- Add deferred FK from orchestration_dags.replay_from_node_id
ALTER TABLE orchestration_dags
  ADD CONSTRAINT orchestration_dags_replay_from_node_id_fkey
  FOREIGN KEY (replay_from_node_id) REFERENCES orchestration_dag_nodes(id);

-- ============================================================================
-- 3.3 orchestration_dag_edges — Dependencies
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration_dag_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id UUID NOT NULL REFERENCES orchestration_dags(id) ON DELETE CASCADE,
  parent_node_id UUID NOT NULL,
  child_node_id UUID NOT NULL,
  edge_kind TEXT NOT NULL DEFAULT 'data'
    CHECK (edge_kind IN ('data','order','barrier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite FK enforces both endpoints belong to the same DAG
  FOREIGN KEY (dag_id, parent_node_id)
    REFERENCES orchestration_dag_nodes(dag_id, id) ON DELETE CASCADE,
  FOREIGN KEY (dag_id, child_node_id)
    REFERENCES orchestration_dag_nodes(dag_id, id) ON DELETE CASCADE,

  UNIQUE (parent_node_id, child_node_id),
  CHECK (parent_node_id <> child_node_id)
);

CREATE INDEX IF NOT EXISTS idx_dag_edges_parent
  ON orchestration_dag_edges(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_dag_edges_child
  ON orchestration_dag_edges(child_node_id);

ALTER TABLE orchestration_dag_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orchestration_dag_edges_org_isolation ON orchestration_dag_edges;
CREATE POLICY orchestration_dag_edges_org_isolation ON orchestration_dag_edges
  FOR ALL TO authenticated
  USING (dag_id IN (
    SELECT id FROM orchestration_dags
    WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ));

-- ============================================================================
-- 3.4 orchestration_dag_templates — Operator-authored backbones
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration_dag_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,

  spec JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,

  trigger_intents TEXT[],
  mission_type TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, slug, version)
);

CREATE INDEX IF NOT EXISTS idx_dag_templates_intent
  ON orchestration_dag_templates USING gin(trigger_intents);

ALTER TABLE orchestration_dag_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orchestration_dag_templates_visibility ON orchestration_dag_templates;
CREATE POLICY orchestration_dag_templates_visibility ON orchestration_dag_templates
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS orchestration_dag_templates_write ON orchestration_dag_templates;
CREATE POLICY orchestration_dag_templates_write ON orchestration_dag_templates
  FOR ALL TO authenticated
  USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('admin','owner')
  ));

-- Add deferred FK from orchestration_dags.template_id
ALTER TABLE orchestration_dags
  ADD CONSTRAINT orchestration_dags_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES orchestration_dag_templates(id);

-- ============================================================================
-- 3.5 orchestration_dag_mutations — Audit log
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration_dag_mutations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id UUID NOT NULL REFERENCES orchestration_dags(id) ON DELETE CASCADE,

  mutation_type TEXT NOT NULL CHECK (mutation_type IN (
    'expand', 'cancel', 'supersede', 'budget_rebalance'
  )),
  source TEXT NOT NULL CHECK (source IN ('agent','operator','system')),
  source_run_id UUID,
  target_node_id UUID REFERENCES orchestration_dag_nodes(id),

  -- Optimistic concurrency (Codex Blocker #3)
  expected_graph_version INTEGER NOT NULL,
  applied_graph_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,

  payload JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by_worker TEXT,

  UNIQUE (dag_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_dag_mutations_dag
  ON orchestration_dag_mutations(dag_id, applied_at);

ALTER TABLE orchestration_dag_mutations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orchestration_dag_mutations_org_isolation ON orchestration_dag_mutations;
CREATE POLICY orchestration_dag_mutations_org_isolation ON orchestration_dag_mutations
  FOR ALL TO authenticated
  USING (dag_id IN (
    SELECT id FROM orchestration_dags
    WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ));

-- ============================================================================
-- 3.6 orchestration_dag_budget_events — Live consumption ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration_dag_budget_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id UUID NOT NULL REFERENCES orchestration_dags(id) ON DELETE CASCADE,
  node_id UUID REFERENCES orchestration_dag_nodes(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'tokens','usd','tool_call','wall_seconds','reservation','release'
  )),
  delta NUMERIC(12,4) NOT NULL,
  cumulative NUMERIC(12,4) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dag_budget_dag
  ON orchestration_dag_budget_events(dag_id, recorded_at);

ALTER TABLE orchestration_dag_budget_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orchestration_dag_budget_events_org_isolation ON orchestration_dag_budget_events;
CREATE POLICY orchestration_dag_budget_events_org_isolation ON orchestration_dag_budget_events
  FOR ALL TO authenticated
  USING (dag_id IN (
    SELECT id FROM orchestration_dags
    WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ));
