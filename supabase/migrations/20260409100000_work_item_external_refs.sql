-- ============================================================================
-- PM External Adapter — Chunk 1: work_item_external_refs
--
-- Stores the mapping between a Lucid human_work_items row and an external PM
-- tool issue/card/task. One row per (work_item_id, provider) — a single work
-- item may be mirrored in multiple tools (rare, but supported).
--
-- Source of truth is ALWAYS human_work_items. External tools are mirrors.
-- This table is a pointer index: work_item_id ↔ (provider, external_id).
--
-- Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.4
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_item_external_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy
  work_item_id UUID NOT NULL REFERENCES human_work_items(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- External reference
  provider TEXT NOT NULL
    CHECK (provider IN ('linear', 'asana', 'trello', 'monday', 'jira')),
  external_id TEXT NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 200),
  external_url TEXT NOT NULL CHECK (char_length(external_url) BETWEEN 1 AND 2000),

  -- Provider-specific metadata (team id, board id, list id, workspace, ...)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Reconcile bookkeeping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_error TEXT,
  sync_attempts INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempts >= 0)
);

-- One mirror per (work_item, provider). A work item can be mirrored in
-- multiple tools but never twice in the same tool.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wier_work_item_provider
  ON work_item_external_refs(work_item_id, provider);

-- Fast webhook lookup: given (provider, external_id) from an incoming
-- webhook, find the work item to apply the change to.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wier_provider_external
  ON work_item_external_refs(provider, external_id);

-- Reconcile cron scan: batched per-provider, ordered by staleness.
CREATE INDEX IF NOT EXISTS idx_wier_reconcile
  ON work_item_external_refs(provider, last_synced_at);

-- Org-scoped filtering (UI / admin views).
CREATE INDEX IF NOT EXISTS idx_wier_org
  ON work_item_external_refs(org_id, created_at DESC);

-- RLS: org-scoped via organization_members
ALTER TABLE work_item_external_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_item_external_refs_org_isolation ON work_item_external_refs;
CREATE POLICY work_item_external_refs_org_isolation ON work_item_external_refs
  FOR ALL TO authenticated
  USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

COMMENT ON TABLE work_item_external_refs IS
  'Pointer index mapping human_work_items rows to external PM tool issues. One row per (work_item_id, provider). Source of truth is human_work_items; this table is a mirror index.';
COMMENT ON COLUMN work_item_external_refs.metadata IS
  'Provider-specific context needed to route subsequent calls: {team_id, project_id, board_id, list_id, workspace_slug, ...}';
COMMENT ON COLUMN work_item_external_refs.last_sync_error IS
  'Populated when reconcile or outbound sync fails. Cleared on next successful sync.';
