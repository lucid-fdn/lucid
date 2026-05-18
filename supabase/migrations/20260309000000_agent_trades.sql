-- Agent Trades table for real-time trade indexing
-- Populated by Helius webhook or manual pushes via /api/launchpad/trades/webhook

CREATE TABLE IF NOT EXISTS agent_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launched_agent_id UUID NOT NULL REFERENCES launched_agents(id) ON DELETE CASCADE,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  wallet_address TEXT NOT NULL,
  amount_tokens NUMERIC NOT NULL DEFAULT 0,
  amount_usdc NUMERIC NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by agent + recency
CREATE INDEX IF NOT EXISTS idx_agent_trades_agent_created
  ON agent_trades(launched_agent_id, created_at DESC);

-- Index for dedup by tx signature
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_trades_tx_sig
  ON agent_trades(tx_signature) WHERE tx_signature IS NOT NULL;
