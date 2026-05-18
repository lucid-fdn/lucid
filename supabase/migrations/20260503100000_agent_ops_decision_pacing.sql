-- ============================================================================
-- Agent Ops Decision Pacing
--
-- Append-only decision ledger for interruption budgets, silent decisions,
-- auto-applied preferences, one-way-door asks, and operator flip events.
-- Existing workspace_decision_preferences remains the preference store.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,

  phase TEXT NOT NULL
    CHECK (phase IN ('scope', 'plan', 'execute', 'review', 'ship', 'monitor', 'retro')),
  question_id TEXT NOT NULL CHECK (char_length(question_id) BETWEEN 1 AND 160),
  door_type TEXT NOT NULL CHECK (door_type IN ('one_way', 'two_way')),
  decision_mode TEXT NOT NULL
    CHECK (decision_mode IN ('asked', 'auto_applied', 'silent_decision', 'flipped')),
  question TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 1000),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_option JSONB,
  risk_reason TEXT,
  reversible BOOLEAN NOT NULL DEFAULT TRUE,
  flipped_from_event_id UUID REFERENCES agent_ops_decision_events(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_decision_events_options_array CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT agent_ops_decision_events_selected_object CHECK (
    selected_option IS NULL OR jsonb_typeof(selected_option) = 'object'
  ),
  CONSTRAINT agent_ops_decision_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT agent_ops_decision_events_one_way_visible CHECK (
    door_type <> 'one_way' OR decision_mode IN ('asked', 'flipped')
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_decision_events_run
  ON agent_ops_decision_events(org_id, ops_run_id, created_at DESC)
  WHERE ops_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_decision_events_project
  ON agent_ops_decision_events(org_id, project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_decision_events_mode
  ON agent_ops_decision_events(org_id, decision_mode, created_at DESC);

ALTER TABLE agent_ops_decision_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_decision_events_org_select ON agent_ops_decision_events;
CREATE POLICY agent_ops_decision_events_org_select ON agent_ops_decision_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_decision_events_org_insert ON agent_ops_decision_events;
CREATE POLICY agent_ops_decision_events_org_insert ON agent_ops_decision_events
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = (SELECT auth.uid())
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_decision_events_service_all ON agent_ops_decision_events;
CREATE POLICY agent_ops_decision_events_service_all ON agent_ops_decision_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
