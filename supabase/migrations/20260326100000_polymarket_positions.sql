-- PolyClaw Phase 4: Persistent Position Tracking
-- Event-sourced trade log + on-chain balance snapshots

-- Event-sourced trade log (written inline after every successful trade)
CREATE TABLE IF NOT EXISTS polymarket_trade_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('Yes', 'No')),
  action TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  amount TEXT NOT NULL,
  price NUMERIC(10,6),
  order_id TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ptl_agent_condition ON polymarket_trade_log (agent_id, condition_id, created_at DESC);
CREATE UNIQUE INDEX idx_ptl_order_dedup ON polymarket_trade_log (order_id) WHERE order_id IS NOT NULL;
ALTER TABLE polymarket_trade_log ENABLE ROW LEVEL SECURITY;

-- RLS: org members can SELECT their org's trade logs.
-- INSERT/UPDATE intentionally omitted — writes are service-role-only (worker fire-and-forget).
CREATE POLICY "org_members_select_trade_log" ON polymarket_trade_log
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- On-chain balance snapshots (written by cron every 5 min)
CREATE TABLE IF NOT EXISTS polymarket_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  token_id TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('Yes', 'No')),
  balance_raw TEXT NOT NULL,
  balance_tokens NUMERIC(18,6) NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pbs_agent_token ON polymarket_balance_snapshots (agent_id, token_id, snapshot_at DESC);
CREATE INDEX idx_pbs_cleanup ON polymarket_balance_snapshots (snapshot_at);
ALTER TABLE polymarket_balance_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS: org members can SELECT snapshots for their agents.
-- INSERT/DELETE intentionally omitted — writes are service-role-only (balance sync cron).
CREATE POLICY "org_members_select_balance_snapshots" ON polymarket_balance_snapshots
  FOR SELECT USING (
    agent_id IN (
      SELECT a.id FROM ai_assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
    )
  );
