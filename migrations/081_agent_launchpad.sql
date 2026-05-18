-- Migration 081: Agent Launchpad
-- Tables: launched_agents, launch_deposits, staking_pools, revenue_epochs, agent_usage_ledger
-- Adds launchpad economic layer on top of existing ai_assistants

-- =============================================================================
-- 1. launched_agents (public wrapper around ai_assistants)
-- =============================================================================
CREATE TABLE IF NOT EXISTS launched_agents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id       UUID NOT NULL UNIQUE REFERENCES ai_assistants(id),
  creator_id         UUID REFERENCES profiles(id),
  creator_wallet     TEXT NOT NULL,
  org_id             UUID NOT NULL REFERENCES organizations(id),

  -- Public metadata
  slug               TEXT NOT NULL UNIQUE,
  display_name       TEXT NOT NULL,
  description        TEXT,
  avatar_url         TEXT,
  category           TEXT NOT NULL DEFAULT 'general'
                       CHECK (category IN (
                         'general','trading','research','creative',
                         'data','social','defi','gaming','other'
                       )),
  tags               TEXT[] DEFAULT '{}',

  -- Token economics (Metaplex Genesis)
  chain              TEXT NOT NULL DEFAULT 'solana',
  token_mint         TEXT,
  genesis_pool_id    TEXT,
  token_supply       BIGINT NOT NULL DEFAULT 1000000000,
  creator_alloc_bps  INTEGER NOT NULL DEFAULT 1000,

  -- Wallet
  agent_wallet_address TEXT,
  wallet_source      TEXT NOT NULL DEFAULT 'privy'
                       CHECK (wallet_source IN ('privy', 'external')),

  -- Pricing
  price_per_request  NUMERIC(12,6) NOT NULL DEFAULT 0.01,
  platform_fee_bps   INTEGER NOT NULL DEFAULT 1500,

  -- Lifecycle
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN (
                         'draft','launching','trading','sunset','archived'
                       )),

  -- Denormalized stats
  total_requests     BIGINT NOT NULL DEFAULT 0,
  total_revenue_usdc NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_staked       BIGINT NOT NULL DEFAULT 0,
  holder_count       INTEGER NOT NULL DEFAULT 0,

  launched_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. launch_deposits (token sale participation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS launch_deposits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launched_agent_id  UUID NOT NULL REFERENCES launched_agents(id) ON DELETE CASCADE,
  depositor_wallet   TEXT NOT NULL,
  depositor_user_id  UUID REFERENCES profiles(id),
  amount_sol         NUMERIC(18,9) NOT NULL,
  tx_signature       TEXT NOT NULL UNIQUE,
  tokens_received    BIGINT,
  status             TEXT NOT NULL DEFAULT 'confirmed'
                       CHECK (status IN ('pending','confirmed','settled','refunded')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. staking_pools (Streamflow references)
-- =============================================================================
CREATE TABLE IF NOT EXISTS staking_pools (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launched_agent_id     UUID NOT NULL REFERENCES launched_agents(id) ON DELETE CASCADE,
  streamflow_pool_id    TEXT NOT NULL UNIQUE,
  reward_mint           TEXT NOT NULL DEFAULT 'USDC',
  total_staked          BIGINT NOT NULL DEFAULT 0,
  total_rewards_distributed NUMERIC(18,6) NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('creating','active','paused','closed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. revenue_epochs (weekly snapshots)
-- =============================================================================
CREATE TABLE IF NOT EXISTS revenue_epochs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launched_agent_id     UUID NOT NULL REFERENCES launched_agents(id) ON DELETE CASCADE,
  epoch_number          INTEGER NOT NULL,
  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  gross_revenue_usdc    NUMERIC(18,6) NOT NULL DEFAULT 0,
  platform_fee_usdc     NUMERIC(18,6) NOT NULL DEFAULT 0,
  staker_reward_usdc    NUMERIC(18,6) NOT NULL DEFAULT 0,
  inference_cost_usdc   NUMERIC(18,6) NOT NULL DEFAULT 0,
  streamflow_reward_pool_id TEXT,
  distribution_tx       TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','calculating','distributed','failed')),
  request_count         BIGINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(launched_agent_id, epoch_number)
);

-- =============================================================================
-- 5. agent_usage_ledger (per-request tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_usage_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launched_agent_id     UUID NOT NULL REFERENCES launched_agents(id),
  user_wallet           TEXT,
  user_id               UUID REFERENCES profiles(id),
  payment_method        TEXT NOT NULL DEFAULT 'crypto'
                          CHECK (payment_method IN ('crypto','fiat')),
  amount_usdc           NUMERIC(12,6) NOT NULL,
  tx_signature          TEXT,
  stripe_payment_id     TEXT,
  epoch_number          INTEGER,
  tokens_used           INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX idx_launched_agents_status ON launched_agents(status);
CREATE INDEX idx_launched_agents_category ON launched_agents(category);
CREATE INDEX idx_launched_agents_creator ON launched_agents(creator_id);
CREATE INDEX idx_launched_agents_org ON launched_agents(org_id);
CREATE INDEX idx_launch_deposits_agent ON launch_deposits(launched_agent_id);
CREATE INDEX idx_launch_deposits_wallet ON launch_deposits(depositor_wallet);
CREATE INDEX idx_staking_pools_agent ON staking_pools(launched_agent_id);
CREATE INDEX idx_revenue_epochs_agent ON revenue_epochs(launched_agent_id);
CREATE INDEX idx_usage_ledger_agent ON agent_usage_ledger(launched_agent_id);
CREATE INDEX idx_usage_ledger_epoch ON agent_usage_ledger(launched_agent_id, epoch_number);
CREATE INDEX idx_usage_ledger_unassigned ON agent_usage_ledger(launched_agent_id) WHERE epoch_number IS NULL;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================
ALTER TABLE launched_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE staking_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_usage_ledger ENABLE ROW LEVEL SECURITY;

-- launched_agents: public read, creator/admin write
CREATE POLICY "launched_agents_select" ON launched_agents FOR SELECT USING (true);
CREATE POLICY "launched_agents_insert" ON launched_agents FOR INSERT
  WITH CHECK (auth.uid() = creator_id OR auth.role() = 'service_role');
CREATE POLICY "launched_agents_update" ON launched_agents FOR UPDATE
  USING (auth.uid() = creator_id OR auth.role() = 'service_role');
CREATE POLICY "launched_agents_delete" ON launched_agents FOR DELETE
  USING (auth.role() = 'service_role');

-- launch_deposits: own read, service_role write
CREATE POLICY "launch_deposits_select" ON launch_deposits FOR SELECT
  USING (depositor_user_id = auth.uid() OR auth.role() = 'service_role');
CREATE POLICY "launch_deposits_insert" ON launch_deposits FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "launch_deposits_update" ON launch_deposits FOR UPDATE
  USING (auth.role() = 'service_role');

-- staking_pools: public read, service_role write
CREATE POLICY "staking_pools_select" ON staking_pools FOR SELECT USING (true);
CREATE POLICY "staking_pools_insert" ON staking_pools FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "staking_pools_update" ON staking_pools FOR UPDATE
  USING (auth.role() = 'service_role');

-- revenue_epochs: public read (transparency), service_role write
CREATE POLICY "revenue_epochs_select" ON revenue_epochs FOR SELECT USING (true);
CREATE POLICY "revenue_epochs_insert" ON revenue_epochs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "revenue_epochs_update" ON revenue_epochs FOR UPDATE
  USING (auth.role() = 'service_role');

-- agent_usage_ledger: own read, service_role write
CREATE POLICY "usage_ledger_select" ON agent_usage_ledger FOR SELECT
  USING (user_id = auth.uid() OR auth.role() = 'service_role');
CREATE POLICY "usage_ledger_insert" ON agent_usage_ledger FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_launched_agents_updated_at
  BEFORE UPDATE ON launched_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_staking_pools_updated_at
  BEFORE UPDATE ON staking_pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RPC: Atomic stat increments (avoids race conditions)
-- =============================================================================
CREATE OR REPLACE FUNCTION increment_agent_stats(
  p_agent_id UUID,
  p_requests BIGINT DEFAULT 0,
  p_revenue NUMERIC DEFAULT 0,
  p_staked BIGINT DEFAULT 0,
  p_holders INTEGER DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  UPDATE launched_agents
  SET
    total_requests = total_requests + p_requests,
    total_revenue_usdc = total_revenue_usdc + p_revenue,
    total_staked = total_staked + p_staked,
    holder_count = holder_count + p_holders
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;
