-- ============================================================================
-- Migration 079: Agent Wallets
--
-- Adds server-side custodial wallets for AI assistants (via Privy):
--   1. agent_wallets table (per-assistant, per-chain wallet records)
--   2. wallet_enabled flag on ai_assistants
--   3. transfer_mode on trading_policies (defi_only / owner_only / unrestricted)
--   4. trading_frozen flag on organizations (org-level kill switch)
--   5. known_protocol_routers table + seed data (allowlisted DEX routers)
-- ============================================================================

-- ============================================================================
-- 1. Agent Wallets Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_wallets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id       UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chain_type         TEXT NOT NULL CHECK (chain_type IN ('ethereum', 'solana')),
  privy_wallet_id    TEXT NOT NULL UNIQUE,
  address            TEXT NOT NULL,
  privy_policy_id    TEXT,
  withdrawal_address TEXT,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('creating', 'active', 'frozen', 'archived')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assistant_id, chain_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_wallets_assistant ON agent_wallets(assistant_id);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_address ON agent_wallets(address);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_org ON agent_wallets(org_id);

-- ============================================================================
-- 2. wallet_enabled flag on ai_assistants
-- ============================================================================

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS wallet_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 3. transfer_mode on trading_policies
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='trading_policies') THEN
    ALTER TABLE trading_policies ADD COLUMN IF NOT EXISTS transfer_mode TEXT NOT NULL DEFAULT 'defi_only'
      CHECK (transfer_mode IN ('defi_only', 'owner_only', 'unrestricted'));
  END IF;
END $$;

-- ============================================================================
-- 4. trading_frozen flag on organizations
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trading_frozen BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 5. Known Protocol Routers (allowlisted DEX router addresses)
-- ============================================================================

CREATE TABLE IF NOT EXISTS known_protocol_routers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id        TEXT NOT NULL,
  protocol        TEXT NOT NULL,
  router_address  TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chain_id, protocol, router_address)
);

INSERT INTO known_protocol_routers (chain_id, protocol, router_address) VALUES
  ('1',     '1inch',      '0x1111111254EEB25477B68fb85Ed929f73A960582'),
  ('1',     'uniswap_v3', '0xE592427A0AEce92De3Edee1F18E0157C05861564'),
  ('8453',  '1inch',      '0x1111111254EEB25477B68fb85Ed929f73A960582'),
  ('8453',  'uniswap_v3', '0x2626664c2603336E57B271c5C0b26F421741e481'),
  ('42161', '1inch',      '0x1111111254EEB25477B68fb85Ed929f73A960582'),
  ('42161', 'uniswap_v3', '0xE592427A0AEce92De3Edee1F18E0157C05861564')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================

ALTER TABLE agent_wallets ENABLE ROW LEVEL SECURITY;

-- Org members can view wallets for assistants in their org
CREATE POLICY "Org members can view agent wallets"
  ON agent_wallets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = agent_wallets.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Org admins/owners can manage wallets
CREATE POLICY "Org admins can manage agent wallets"
  ON agent_wallets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = agent_wallets.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Service role has full access
CREATE POLICY "Service role has full access to agent wallets"
  ON agent_wallets FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE known_protocol_routers ENABLE ROW LEVEL SECURITY;

-- Anyone can read known routers
CREATE POLICY "Anyone can read known protocol routers"
  ON known_protocol_routers FOR SELECT
  USING (true);

-- Only service role can manage routers
CREATE POLICY "Service role can manage known protocol routers"
  ON known_protocol_routers FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 7. Updated_at Trigger
-- ============================================================================

CREATE TRIGGER update_agent_wallets_updated_at
  BEFORE UPDATE ON agent_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. Comments
-- ============================================================================

COMMENT ON TABLE agent_wallets IS 'Server-side custodial wallets for AI assistants, provisioned via Privy';
COMMENT ON TABLE known_protocol_routers IS 'Allowlisted DEX router contract addresses per chain';
COMMENT ON COLUMN known_protocol_routers.router_address IS 'On-chain contract address of the DEX router';
COMMENT ON COLUMN ai_assistants.wallet_enabled IS 'Whether this assistant has an agent wallet provisioned and active';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='trading_policies') THEN
    EXECUTE 'COMMENT ON COLUMN trading_policies.transfer_mode IS ''Token transfer restriction: defi_only (swaps only), owner_only (withdraw to owner), unrestricted''';
  END IF;
END $$;
COMMENT ON COLUMN organizations.trading_frozen IS 'Org-level kill switch that freezes all agent trading activity';
