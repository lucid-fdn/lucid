-- Migration 090: Mission Control Phase 2 — Guardrails + Replay
-- Tables: mc_agent_cost_tracking
-- Columns: ai_assistants cost limits + alert_config
-- RPCs: mc_replay_conversation, mc_agent_cost_summary

-- ─── Cost limit columns on ai_assistants ───

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS cost_limit_per_run_usd NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS cost_limit_daily_usd NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS cost_limit_monthly_usd NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS alert_config JSONB DEFAULT '{}';

COMMENT ON COLUMN ai_assistants.cost_limit_per_run_usd IS 'Max token spend per single run (USD). NULL = no limit.';
COMMENT ON COLUMN ai_assistants.cost_limit_daily_usd IS 'Max daily spend (USD). NULL = no limit.';
COMMENT ON COLUMN ai_assistants.cost_limit_monthly_usd IS 'Max monthly spend (USD). NULL = no limit.';
COMMENT ON COLUMN ai_assistants.alert_config IS 'JSONB config for alert rules: { cost_threshold_usd, error_rate_pct, loop_detection_threshold }';

-- ─── mc_agent_cost_tracking ───

CREATE TABLE IF NOT EXISTS mc_agent_cost_tracking (
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  tokens_input BIGINT NOT NULL DEFAULT 0,
  tokens_output BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, date)
);

CREATE INDEX IF NOT EXISTS idx_mc_cost_tracking_org_date
  ON mc_agent_cost_tracking (org_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_mc_cost_tracking_agent_date
  ON mc_agent_cost_tracking (agent_id, date DESC);

ALTER TABLE mc_agent_cost_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's cost tracking"
  ON mc_agent_cost_tracking FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- ─── mc_upsert_cost_tracking: atomic upsert for daily cost row ───

CREATE OR REPLACE FUNCTION mc_upsert_cost_tracking(
  p_agent_id UUID,
  p_org_id UUID,
  p_tokens_input BIGINT,
  p_tokens_output BIGINT,
  p_cost_usd NUMERIC(10,4)
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO mc_agent_cost_tracking (agent_id, org_id, date, tokens_input, tokens_output, estimated_cost_usd, run_count, updated_at)
  VALUES (p_agent_id, p_org_id, CURRENT_DATE, p_tokens_input, p_tokens_output, p_cost_usd, 1, now())
  ON CONFLICT (agent_id, date) DO UPDATE SET
    tokens_input = mc_agent_cost_tracking.tokens_input + EXCLUDED.tokens_input,
    tokens_output = mc_agent_cost_tracking.tokens_output + EXCLUDED.tokens_output,
    estimated_cost_usd = mc_agent_cost_tracking.estimated_cost_usd + EXCLUDED.estimated_cost_usd,
    run_count = mc_agent_cost_tracking.run_count + 1,
    updated_at = now();
$$;

-- ─── mc_agent_cost_summary: returns cost data for an agent ───

CREATE OR REPLACE FUNCTION mc_agent_cost_summary(
  p_agent_id UUID,
  p_org_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_today_cost NUMERIC(10,4);
  v_month_cost NUMERIC(10,4);
  v_daily_limit NUMERIC(10,4);
  v_monthly_limit NUMERIC(10,4);
  v_per_run_limit NUMERIC(10,4);
BEGIN
  -- Get limits from assistant
  SELECT
    a.cost_limit_daily_usd,
    a.cost_limit_monthly_usd,
    a.cost_limit_per_run_usd
  INTO v_daily_limit, v_monthly_limit, v_per_run_limit
  FROM ai_assistants a
  WHERE a.id = p_agent_id AND a.org_id = p_org_id AND a.deleted_at IS NULL;

  -- Today's cost
  SELECT COALESCE(SUM(estimated_cost_usd), 0)
  INTO v_today_cost
  FROM mc_agent_cost_tracking
  WHERE agent_id = p_agent_id AND date = CURRENT_DATE;

  -- This month's cost
  SELECT COALESCE(SUM(estimated_cost_usd), 0)
  INTO v_month_cost
  FROM mc_agent_cost_tracking
  WHERE agent_id = p_agent_id
    AND date >= date_trunc('month', CURRENT_DATE);

  -- Recent daily costs (last 30 days)
  SELECT json_build_object(
    'today_cost_usd', v_today_cost,
    'month_cost_usd', v_month_cost,
    'daily_limit_usd', v_daily_limit,
    'monthly_limit_usd', v_monthly_limit,
    'per_run_limit_usd', v_per_run_limit,
    'daily_history', COALESCE((
      SELECT json_agg(json_build_object(
        'date', ct.date,
        'cost_usd', ct.estimated_cost_usd,
        'tokens_input', ct.tokens_input,
        'tokens_output', ct.tokens_output,
        'run_count', ct.run_count
      ) ORDER BY ct.date DESC)
      FROM mc_agent_cost_tracking ct
      WHERE ct.agent_id = p_agent_id
        AND ct.date >= CURRENT_DATE - INTERVAL '30 days'
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- ─── mc_replay_conversation: returns events for a run grouped by run context ───
-- Replay is just feed events grouped by conversation/run.
-- Uses the existing mc_feed_events_v view — no new table.

CREATE OR REPLACE FUNCTION mc_replay_conversations(
  p_org_id UUID,
  p_agent_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(conv ORDER BY latest_at DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      ie.id AS conversation_id,
      aa.id AS agent_id,
      aa.name AS agent_name,
      ac.channel_type,
      ie.external_user_id,
      ie.status,
      ie.created_at AS started_at,
      ie.processed_at AS finished_at,
      LEFT(ie.message_text, 100) AS preview,
      ie.created_at AS latest_at
    FROM assistant_inbound_events ie
    JOIN assistant_channels ac ON ac.id = ie.channel_id
    JOIN ai_assistants aa ON aa.id = ac.assistant_id
    WHERE aa.org_id = p_org_id
      AND aa.deleted_at IS NULL
      AND (p_agent_id IS NULL OR aa.id = p_agent_id)
    ORDER BY ie.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) conv;

  RETURN result;
END;
$$;

-- mc_replay_run: returns the full event trail for a single inbound event (run)
CREATE OR REPLACE FUNCTION mc_replay_run(
  p_event_id UUID,
  p_org_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'inbound', (
      SELECT row_to_json(ie.*)
      FROM assistant_inbound_events ie
      JOIN assistant_channels ac ON ac.id = ie.channel_id
      JOIN ai_assistants aa ON aa.id = ac.assistant_id
      WHERE ie.id = p_event_id
        AND aa.org_id = p_org_id
        AND aa.deleted_at IS NULL
    ),
    'outbound', COALESCE((
      SELECT json_agg(row_to_json(oe.*) ORDER BY oe.created_at ASC)
      FROM assistant_outbound_events oe
      WHERE oe.inbound_event_id = p_event_id
    ), '[]'::json),
    'agent', (
      SELECT json_build_object(
        'id', aa.id,
        'name', aa.name,
        'lucid_model', aa.lucid_model
      )
      FROM assistant_inbound_events ie
      JOIN assistant_channels ac ON ac.id = ie.channel_id
      JOIN ai_assistants aa ON aa.id = ac.assistant_id
      WHERE ie.id = p_event_id
        AND aa.org_id = p_org_id
    )
  ) INTO result;

  RETURN result;
END;
$$;
