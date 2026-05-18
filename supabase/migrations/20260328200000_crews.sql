-- Crew Mode v1 — Multi-Agent Orchestration
-- 5 tables: crews, crew_members, crew_edges, crew_runs, crew_run_members
-- + RLS, RPCs, Realtime, feed event types, sync trigger

-- ─── 1. Crew definition ───────────────────────────────────────────────

CREATE TABLE crews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  objective TEXT NOT NULL,
  lead_member_id UUID,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  max_concurrent_runs INT NOT NULL DEFAULT 1,
  cost_limit_per_run_usd NUMERIC(10,4),
  cost_limit_daily_usd NUMERIC(10,4),
  topology_enforced BOOLEAN NOT NULL DEFAULT false,
  canvas_position JSONB,
  canvas_size JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ─── 2. Membership ────────────────────────────────────────────────────

CREATE TABLE crew_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL DEFAULT 'assistant'
    CHECK (member_type IN ('assistant')),
  member_ref_id UUID NOT NULL,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  role_description TEXT,
  is_coordinator BOOLEAN NOT NULL DEFAULT false,
  join_order INT NOT NULL DEFAULT 0,
  position_in_crew JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (member_type != 'assistant' OR assistant_id = member_ref_id),
  UNIQUE (crew_id, member_ref_id)
);

-- Exactly one coordinator per crew
CREATE UNIQUE INDEX idx_crew_members_one_coordinator
  ON crew_members (crew_id) WHERE is_coordinator = true;

-- FK from crews.lead_member_id → crew_members.id
ALTER TABLE crews ADD CONSTRAINT fk_crews_lead
  FOREIGN KEY (lead_member_id) REFERENCES crew_members(id) ON DELETE SET NULL;

-- ─── 3. Communication topology ────────────────────────────────────────

CREATE TABLE crew_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  source_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  target_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'bidirectional'
    CHECK (direction IN ('unidirectional', 'bidirectional')),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_member_id != target_member_id),
  UNIQUE (crew_id, source_member_id, target_member_id)
);

-- ─── 4. Crew-level execution tracking ────────────────────────────────

CREATE TABLE crew_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'scheduled', 'agent', 'api')),
  triggered_by UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'starting'
    CHECK (status IN ('starting', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  outcome_summary TEXT,
  error_message TEXT,
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 5. Per-member run status ─────────────────────────────────────────

CREATE TABLE crew_run_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_run_id UUID NOT NULL REFERENCES crew_runs(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'starting', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome_summary TEXT,
  error_message TEXT,
  cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  UNIQUE (crew_run_id, crew_member_id)
);

-- ─── Denormalized cache on ai_assistants ──────────────────────────────

ALTER TABLE ai_assistants ADD COLUMN IF NOT EXISTS crew_id UUID REFERENCES crews(id) ON DELETE SET NULL;

-- ─── Indexes ──────────────────────────────────────────────────────────

CREATE INDEX idx_crews_org ON crews (org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_crew_members_crew ON crew_members (crew_id);
CREATE INDEX idx_crew_members_assistant ON crew_members (assistant_id);
CREATE INDEX idx_crew_edges_crew ON crew_edges (crew_id);
CREATE INDEX idx_crew_runs_crew ON crew_runs (crew_id, status);
CREATE INDEX idx_crew_run_members_run ON crew_run_members (crew_run_id);
CREATE INDEX idx_assistants_crew ON ai_assistants (crew_id) WHERE crew_id IS NOT NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_run_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crews visible to org members" ON crews
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Crew members visible to org members" ON crew_members
  FOR ALL USING (crew_id IN (
    SELECT id FROM crews WHERE org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Crew edges visible to org members" ON crew_edges
  FOR ALL USING (crew_id IN (
    SELECT id FROM crews WHERE org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Crew runs visible to org members" ON crew_runs
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Crew run members visible to org members" ON crew_run_members
  FOR ALL USING (crew_run_id IN (
    SELECT id FROM crew_runs WHERE org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

-- ─── Sync trigger: keep ai_assistants.crew_id in sync ─────────────────

CREATE OR REPLACE FUNCTION sync_assistant_crew_id()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.member_type = 'assistant' THEN
    UPDATE ai_assistants SET crew_id = NEW.crew_id WHERE id = NEW.member_ref_id;
  ELSIF TG_OP = 'DELETE' AND OLD.member_type = 'assistant' THEN
    UPDATE ai_assistants SET crew_id = NULL WHERE id = OLD.member_ref_id AND crew_id = OLD.crew_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_crew_id
AFTER INSERT OR DELETE ON crew_members
FOR EACH ROW EXECUTE FUNCTION sync_assistant_crew_id();

-- ─── Realtime ─────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'crews') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crews;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'crew_runs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crew_runs;
  END IF;
END $$;

-- ─── Feed event types ─────────────────────────────────────────────────
-- Extend mc_agent_events.event_type CHECK to include crew events.
-- The existing CHECK constraint name may vary; we drop and re-add.

DO $$
BEGIN
  -- Try to drop existing check constraint on event_type
  BEGIN
    ALTER TABLE mc_agent_events DROP CONSTRAINT IF EXISTS mc_agent_events_event_type_check;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;

  -- Add updated check with crew event types
  ALTER TABLE mc_agent_events ADD CONSTRAINT mc_agent_events_event_type_check
    CHECK (event_type IN (
      'tool_call', 'tool_result', 'error',
      'approval_requested', 'approval_resolved',
      'run_started', 'run_finished',
      'agent_paused', 'agent_resumed',
      'message_received', 'message_sent',
      'transaction_submitted', 'transaction_confirmed', 'transaction_failed',
      'remediation_triggered',
      'receipt_created', 'receipt_verified',
      'passport_provisioned', 'epoch_anchored',
      'task_scheduled', 'task_completed', 'task_failed', 'task_cancelled',
      'agent_message_sent', 'subagent_spawned', 'subagent_completed', 'subagent_failed',
      'crew_run_started', 'crew_run_completed', 'crew_run_failed',
      'crew_member_started', 'crew_member_completed', 'crew_member_failed'
    ));
END $$;

-- ─── RPCs ─────────────────────────────────────────────────────────────

-- get_crew_with_topology: crew + members (with assistant data) + edges
CREATE OR REPLACE FUNCTION get_crew_with_topology(
  p_crew_id UUID,
  p_org_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_crew JSON;
  v_members JSON;
  v_edges JSON;
BEGIN
  SELECT to_json(c) INTO v_crew
  FROM crews c
  WHERE c.id = p_crew_id AND c.org_id = p_org_id AND c.deleted_at IS NULL;

  IF v_crew IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json) INTO v_members
  FROM (
    SELECT
      cm.id,
      cm.crew_id,
      cm.member_type,
      cm.member_ref_id,
      cm.assistant_id,
      cm.role,
      cm.role_description,
      cm.is_coordinator,
      cm.join_order,
      cm.position_in_crew,
      cm.created_at,
      a.name AS assistant_name,
      a.lucid_model AS assistant_model,
      a.is_active AS assistant_is_active
    FROM crew_members cm
    LEFT JOIN ai_assistants a ON a.id = cm.assistant_id
    WHERE cm.crew_id = p_crew_id
    ORDER BY cm.join_order, cm.created_at
  ) m;

  SELECT COALESCE(json_agg(row_to_json(e)), '[]'::json) INTO v_edges
  FROM (
    SELECT
      ce.id,
      ce.crew_id,
      ce.source_member_id,
      ce.target_member_id,
      ce.direction,
      ce.label,
      ce.created_at
    FROM crew_edges ce
    WHERE ce.crew_id = p_crew_id
    ORDER BY ce.created_at
  ) e;

  RETURN json_build_object(
    'crew', v_crew,
    'members', v_members,
    'edges', v_edges
  );
END;
$$;

-- start_crew_run: atomically creates run + member rows
CREATE OR REPLACE FUNCTION start_crew_run(
  p_crew_id UUID,
  p_org_id UUID,
  p_trigger_type TEXT DEFAULT 'manual',
  p_triggered_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id UUID;
  v_crew_status TEXT;
BEGIN
  -- Validate crew exists and belongs to org
  SELECT status INTO v_crew_status
  FROM crews
  WHERE id = p_crew_id AND org_id = p_org_id AND deleted_at IS NULL;

  IF v_crew_status IS NULL THEN
    RAISE EXCEPTION 'Crew not found or not in this org';
  END IF;

  -- Check concurrent run limit
  PERFORM 1 FROM crew_runs
  WHERE crew_id = p_crew_id AND status IN ('starting', 'running')
  LIMIT 1;

  IF FOUND THEN
    DECLARE
      v_max INT;
      v_active INT;
    BEGIN
      SELECT max_concurrent_runs INTO v_max FROM crews WHERE id = p_crew_id;
      SELECT COUNT(*) INTO v_active FROM crew_runs
        WHERE crew_id = p_crew_id AND status IN ('starting', 'running');
      IF v_active >= v_max THEN
        RAISE EXCEPTION 'Concurrent run limit reached (% of %)', v_active, v_max;
      END IF;
    END;
  END IF;

  -- Create run
  INSERT INTO crew_runs (crew_id, org_id, trigger_type, triggered_by)
  VALUES (p_crew_id, p_org_id, p_trigger_type, p_triggered_by)
  RETURNING id INTO v_run_id;

  -- Snapshot current members into run
  INSERT INTO crew_run_members (crew_run_id, crew_member_id, assistant_id)
  SELECT v_run_id, cm.id, cm.assistant_id
  FROM crew_members cm
  WHERE cm.crew_id = p_crew_id;

  -- Activate crew if draft
  IF v_crew_status = 'draft' THEN
    UPDATE crews SET status = 'active', updated_at = now()
    WHERE id = p_crew_id;
  END IF;

  RETURN v_run_id;
END;
$$;

-- can_crew_members_communicate: topology check
CREATE OR REPLACE FUNCTION can_crew_members_communicate(
  p_crew_id UUID,
  p_source_assistant_id UUID,
  p_target_assistant_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enforced BOOLEAN;
  v_source_member_id UUID;
  v_target_member_id UUID;
BEGIN
  SELECT topology_enforced INTO v_enforced
  FROM crews WHERE id = p_crew_id AND deleted_at IS NULL;

  IF v_enforced IS NULL THEN
    RETURN FALSE;
  END IF;

  -- If topology not enforced, any member can talk to any member
  IF NOT v_enforced THEN
    RETURN TRUE;
  END IF;

  -- Resolve member IDs
  SELECT id INTO v_source_member_id
  FROM crew_members WHERE crew_id = p_crew_id AND assistant_id = p_source_assistant_id;

  SELECT id INTO v_target_member_id
  FROM crew_members WHERE crew_id = p_crew_id AND assistant_id = p_target_assistant_id;

  IF v_source_member_id IS NULL OR v_target_member_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check for direct edge (either direction for bidirectional)
  RETURN EXISTS (
    SELECT 1 FROM crew_edges
    WHERE crew_id = p_crew_id
    AND (
      (source_member_id = v_source_member_id AND target_member_id = v_target_member_id)
      OR (
        direction = 'bidirectional'
        AND source_member_id = v_target_member_id
        AND target_member_id = v_source_member_id
      )
    )
  );
END;
$$;
