-- Mission Control Phase 3: Proof Explorer
-- Action log with chain proof references, policy snapshots

-- ─── Proof Anchors ───
-- Links agent actions to on-chain attestations (when L3 is ready)
CREATE TABLE IF NOT EXISTS mc_proof_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id),
  run_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_args JSONB DEFAULT '{}'::jsonb,
  tool_result_hash TEXT,             -- SHA-256 of tool result for integrity
  policy_snapshot JSONB,             -- Trading policy state at time of action
  anchor_tx_hash TEXT,               -- On-chain tx hash (NULL until L3 ready)
  anchor_chain TEXT,                 -- Chain identifier (e.g., 'solana', 'l3')
  anchor_status TEXT DEFAULT 'pending', -- pending | anchored | verified | failed
  verification_data JSONB,          -- Proof data for verification
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE mc_proof_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY mc_proof_anchors_org_access ON mc_proof_anchors
  FOR ALL
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mc_proof_anchors_org_agent
  ON mc_proof_anchors (org_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_proof_anchors_run
  ON mc_proof_anchors (run_id);

CREATE INDEX IF NOT EXISTS idx_mc_proof_anchors_tx
  ON mc_proof_anchors (anchor_tx_hash)
  WHERE anchor_tx_hash IS NOT NULL;

-- ─── RPC: Fetch proof log for an agent ───
CREATE OR REPLACE FUNCTION mc_proof_log(
  p_org_id UUID,
  p_agent_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS SETOF mc_proof_anchors
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pa.*
  FROM mc_proof_anchors pa
  JOIN organization_members om
    ON om.organization_id = pa.org_id
    AND om.user_id = auth.uid()
  WHERE pa.org_id = p_org_id
    AND (p_agent_id IS NULL OR pa.agent_id = p_agent_id)
  ORDER BY pa.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- ─── RPC: Fetch single proof by ID ───
CREATE OR REPLACE FUNCTION mc_proof_detail(
  p_proof_id UUID,
  p_org_id UUID
)
RETURNS SETOF mc_proof_anchors
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pa.*
  FROM mc_proof_anchors pa
  JOIN organization_members om
    ON om.organization_id = pa.org_id
    AND om.user_id = auth.uid()
  WHERE pa.id = p_proof_id
    AND pa.org_id = p_org_id
  LIMIT 1;
$$;
