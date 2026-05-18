-- Mission Control Phase 7: Time-Travel Debugger

-- ─── Turn Snapshots ───
-- Full context captured per turn for replay + what-if analysis
CREATE TABLE IF NOT EXISTS mc_turn_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id),
  run_id TEXT NOT NULL,
  turn_index INT NOT NULL,
  system_prompt TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  temperature NUMERIC(3,2),
  tool_calls JSONB DEFAULT '[]'::jsonb,
  tool_results JSONB DEFAULT '[]'::jsonb,
  assistant_response TEXT,
  tokens_input INT,
  tokens_output INT,
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_turn_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_turn_snapshots_org ON mc_turn_snapshots
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_mc_turn_snapshots_run
  ON mc_turn_snapshots (run_id, turn_index);

CREATE INDEX IF NOT EXISTS idx_mc_turn_snapshots_agent
  ON mc_turn_snapshots (agent_id, created_at DESC);

-- ─── What-If Results ───
-- Stores results of re-running a turn with modified parameters
CREATE TABLE IF NOT EXISTS mc_whatif_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  snapshot_id UUID NOT NULL REFERENCES mc_turn_snapshots(id),
  modified_params JSONB NOT NULL,    -- { model: 'gpt-4o', temperature: 0.5 }
  original_response TEXT,
  replayed_response TEXT,
  original_tokens INT,
  replayed_tokens INT,
  original_cost_usd NUMERIC(10,4),
  replayed_cost_usd NUMERIC(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_whatif_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_whatif_org ON mc_whatif_results
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

-- ─── RPC: Get turn snapshots for a run ───
CREATE OR REPLACE FUNCTION mc_turn_snapshots_for_run(
  p_run_id TEXT,
  p_org_id UUID
)
RETURNS SETOF mc_turn_snapshots
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ts.*
  FROM mc_turn_snapshots ts
  JOIN organization_members om
    ON om.organization_id = ts.org_id
    AND om.user_id = auth.uid()
  WHERE ts.run_id = p_run_id
    AND ts.org_id = p_org_id
  ORDER BY ts.turn_index;
$$;
