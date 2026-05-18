-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.755Z.

-- Remote migration version: 20260429220000

-- Remote migration name: agent_ops_run_metrics



-- Agent Ops run metrics and usage accounting.
--
-- Keep aggregate fields on agent_ops_runs for fast Mission Control queries,
-- while preserving append-only usage events for auditability and future
-- provider/runtime-specific reconciliation.

ALTER TABLE agent_ops_runs
  ADD COLUMN IF NOT EXISTS latency_ms BIGINT CHECK (latency_ms IS NULL OR latency_ms >= 0),
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(18, 8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0);

CREATE INDEX IF NOT EXISTS idx_agent_ops_runs_org_latency
  ON agent_ops_runs(org_id, workflow_id, latency_ms, created_at DESC)
  WHERE latency_ms IS NOT NULL;

CREATE OR REPLACE FUNCTION public.compute_agent_ops_run_latency()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.started_at IS NOT NULL AND NEW.completed_at IS NOT NULL THEN
    NEW.latency_ms := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000)::BIGINT
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compute_agent_ops_run_latency ON agent_ops_runs;

CREATE TRIGGER compute_agent_ops_run_latency
  BEFORE INSERT OR UPDATE OF started_at, completed_at ON agent_ops_runs
  FOR EACH ROW EXECUTE FUNCTION public.compute_agent_ops_run_latency();

CREATE TABLE IF NOT EXISTS agent_ops_run_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'orchestration_step',
    'browser_qa',
    'agent_run',
    'manual',
    'external'
  )),
  source_ref TEXT,
  duration_ms BIGINT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
  cost_usd NUMERIC(18, 8) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_run_usage_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_run_usage_events_run
  ON agent_ops_run_usage_events(ops_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_run_usage_events_org
  ON agent_ops_run_usage_events(org_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_run_usage_events_source
  ON agent_ops_run_usage_events(ops_run_id, source_kind, source_ref)
  WHERE source_ref IS NOT NULL;

ALTER TABLE agent_ops_run_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_run_usage_events_org_select ON agent_ops_run_usage_events;

CREATE POLICY agent_ops_run_usage_events_org_select ON agent_ops_run_usage_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_ops_run_usage_events_service_all ON agent_ops_run_usage_events;

CREATE POLICY agent_ops_run_usage_events_service_all ON agent_ops_run_usage_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.rollup_agent_ops_run_usage_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  input_delta INTEGER;
  output_delta INTEGER;
  total_delta INTEGER;
  cost_delta NUMERIC(18, 8);
BEGIN
  input_delta := COALESCE(NEW.input_tokens, 0) - CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.input_tokens, 0) ELSE 0 END;
  output_delta := COALESCE(NEW.output_tokens, 0) - CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.output_tokens, 0) ELSE 0 END;
  total_delta := COALESCE(
    NEW.total_tokens,
    COALESCE(NEW.input_tokens, 0) + COALESCE(NEW.output_tokens, 0)
  ) - CASE
    WHEN TG_OP = 'UPDATE' THEN COALESCE(
      OLD.total_tokens,
      COALESCE(OLD.input_tokens, 0) + COALESCE(OLD.output_tokens, 0)
    )
    ELSE 0
  END;
  cost_delta := COALESCE(NEW.cost_usd, 0) - CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.cost_usd, 0) ELSE 0 END;

  UPDATE agent_ops_runs
  SET
    input_tokens = GREATEST(0, input_tokens + input_delta),
    output_tokens = GREATEST(0, output_tokens + output_delta),
    total_tokens = GREATEST(0, total_tokens + total_delta),
    cost_usd = GREATEST(0, cost_usd + cost_delta)
  WHERE id = NEW.ops_run_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rollup_agent_ops_run_usage_event ON agent_ops_run_usage_events;

CREATE TRIGGER rollup_agent_ops_run_usage_event
  AFTER INSERT OR UPDATE ON agent_ops_run_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.rollup_agent_ops_run_usage_event();
