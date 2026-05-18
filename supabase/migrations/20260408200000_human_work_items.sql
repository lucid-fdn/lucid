-- ============================================================================
-- Phase 0 — Pulse + Nerve Human + PM Integration: Schema Foundation
--
-- Creates the storage layer for two new human-work shapes:
--   1. Pulse-standalone human jobs (tickets/approvals/support) — stored as
--      kind='pulse_standalone', referenced by pulse_job_run_id.
--   2. Nerve human_task DAG nodes (human steps inside an agent plan) —
--      stored as kind='nerve_node', referenced by dag_id + dag_node_id.
--
-- Also extends orchestration_dag_nodes.node_type to admit 'human_task' so the
-- scheduler can promote human steps as first-class graph shapes.
--
-- Design: docs/plans/2026-04-08-pulse-nerve-human-pm-integration.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend orchestration_dag_nodes.node_type CHECK to include 'human_task'
-- ----------------------------------------------------------------------------
ALTER TABLE orchestration_dag_nodes
  DROP CONSTRAINT IF EXISTS orchestration_dag_nodes_node_type_check;

ALTER TABLE orchestration_dag_nodes
  ADD CONSTRAINT orchestration_dag_nodes_node_type_check
  CHECK (node_type IN (
    'leaf', 'group', 'barrier', 'expansion_zone', 'approval', 'human_task'
  ));

-- Extend confidence_source CHECK to admit 'human' (human-stamped confidence
-- when a human work item is resolved — e.g., confidence_observed = 1.0 on
-- approval, 0.0 on rejection).
ALTER TABLE orchestration_dag_nodes
  DROP CONSTRAINT IF EXISTS orchestration_dag_nodes_confidence_source_check;

ALTER TABLE orchestration_dag_nodes
  ADD CONSTRAINT orchestration_dag_nodes_confidence_source_check
  CHECK (confidence_source IN ('static', 'router', 'self_report', 'human'));

-- ----------------------------------------------------------------------------
-- 2. human_work_items — unified human work ledger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS human_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Kind determines which reference columns are populated
  kind TEXT NOT NULL CHECK (kind IN ('pulse_standalone', 'nerve_node')),

  -- Pulse-standalone reference (null for nerve_node items)
  pulse_job_run_id TEXT,                  -- runId of the Pulse human job (if any)

  -- Nerve-node reference (null for pulse_standalone items)
  dag_id UUID REFERENCES orchestration_dags(id) ON DELETE CASCADE,
  dag_node_id UUID REFERENCES orchestration_dag_nodes(id) ON DELETE CASCADE,

  -- Optional agent linkage (the agent that created or is waiting on this item)
  agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,

  -- Human presentation
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description TEXT,                       -- Markdown; rendered in MC PM surface
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  labels TEXT[] NOT NULL DEFAULT '{}',    -- Free-form tags for filtering

  -- Assignment
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_role TEXT,                     -- Optional role-based routing ('reviewer','approver',…)

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting', 'done', 'cancelled', 'rejected')),
  resolution TEXT,                        -- 'approved' | 'rejected' | 'completed' | custom
  resolution_notes TEXT,

  -- SLA / scheduling
  due_at TIMESTAMPTZ,
  sla_seconds INTEGER,                    -- If set, due_at can be derived on insert
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- External PM tool mirror (Phase 4-5)
  external_mirror JSONB,                  -- {provider,external_id,url,last_synced_at}

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Mutually-exclusive reference shape: pulse_standalone MUST have
  -- pulse_job_run_id and MUST NOT have dag refs; nerve_node MUST have both
  -- dag_id and dag_node_id and MUST NOT have pulse_job_run_id.
  CONSTRAINT human_work_items_kind_refs_xor CHECK (
    (kind = 'pulse_standalone'
      AND pulse_job_run_id IS NOT NULL
      AND dag_id IS NULL
      AND dag_node_id IS NULL)
    OR
    (kind = 'nerve_node'
      AND pulse_job_run_id IS NULL
      AND dag_id IS NOT NULL
      AND dag_node_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_human_work_items_org_status
  ON human_work_items(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_human_work_items_assignee
  ON human_work_items(assignee_user_id, status, due_at NULLS LAST)
  WHERE assignee_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_human_work_items_dag_node
  ON human_work_items(dag_node_id)
  WHERE dag_node_id IS NOT NULL;

-- Idempotency guard for the Phase 2 dispatcher: at most one nerve_node
-- work item per (dag_id, dag_node_id). The dispatcher catches 23505 on
-- this constraint and treats it as "already dispatched, no-op success"
-- so a scheduler retry (e.g., after a worker crash mid-promote) cannot
-- create duplicate work items.
CREATE UNIQUE INDEX IF NOT EXISTS idx_human_work_items_nerve_node_unique
  ON human_work_items(dag_id, dag_node_id)
  WHERE kind = 'nerve_node';

CREATE INDEX IF NOT EXISTS idx_human_work_items_pulse_run
  ON human_work_items(pulse_job_run_id)
  WHERE pulse_job_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_human_work_items_due
  ON human_work_items(due_at)
  WHERE due_at IS NOT NULL AND status IN ('open', 'in_progress', 'waiting');

-- RLS: org-scoped via organization_members
ALTER TABLE human_work_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS human_work_items_org_isolation ON human_work_items;
CREATE POLICY human_work_items_org_isolation ON human_work_items
  FOR ALL TO authenticated
  USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- updated_at trigger
CREATE OR REPLACE FUNCTION human_work_items_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS human_work_items_updated_at ON human_work_items;
CREATE TRIGGER human_work_items_updated_at
  BEFORE UPDATE ON human_work_items
  FOR EACH ROW EXECUTE FUNCTION human_work_items_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. human_work_item_events — activity feed (append-only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS human_work_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES human_work_items(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Who did it
  actor_kind TEXT NOT NULL
    CHECK (actor_kind IN ('user', 'agent', 'system', 'external_sync')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  actor_external_provider TEXT,         -- 'linear'|'jira'|... when actor_kind='external_sync'

  -- What happened
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'assigned', 'status_changed', 'commented', 'labeled',
    'due_changed', 'resolved', 'reopened', 'external_mirrored',
    'external_synced', 'cancelled'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_human_work_item_events_item
  ON human_work_item_events(work_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_human_work_item_events_org
  ON human_work_item_events(org_id, created_at DESC);

ALTER TABLE human_work_item_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS human_work_item_events_org_isolation ON human_work_item_events;
CREATE POLICY human_work_item_events_org_isolation ON human_work_item_events
  FOR ALL TO authenticated
  USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- ----------------------------------------------------------------------------
-- 4. Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE human_work_items IS
  'Unified human work ledger. kind=pulse_standalone for tickets/approvals routed through Pulse; kind=nerve_node for human_task nodes inside an agent DAG plan.';
COMMENT ON TABLE human_work_item_events IS
  'Append-only activity feed for human_work_items. Captures the full audit trail: creation, assignment, status transitions, comments, external PM sync events.';
COMMENT ON COLUMN human_work_items.external_mirror IS
  'Mirror state for external PM tools (Linear/Jira/Asana/Trello/Monday). Shape: {provider,external_id,url,last_synced_at}.';
