-- ============================================================================
-- Migration 072: P1 Onchain Capabilities & Quorum Requests
-- ============================================================================
-- Adds:
--   1. quorum_requests table for high-value trade approvals
--   2. onchain_capabilities JSONB column on trading_policies
-- ============================================================================

-- ============================================================================
-- PART 1: Quorum Requests Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS quorum_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES trading_transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  assistant_id UUID NOT NULL REFERENCES assistants(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  value_usd NUMERIC(18,2) NOT NULL CHECK (value_usd > 0),
  chain_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  required_approvals INT NOT NULL DEFAULT 2 CHECK (required_approvals > 0),
  approvals JSONB DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_transaction_id ON quorum_requests(transaction_id);
CREATE INDEX IF NOT EXISTS idx_qr_user_id ON quorum_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_org_id ON quorum_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_qr_status ON quorum_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_qr_expires_at ON quorum_requests(expires_at) WHERE status = 'pending';

ALTER TABLE quorum_requests ENABLE ROW LEVEL SECURITY;

-- Org members can view quorum requests for their org
CREATE POLICY "Org members can view quorum requests"
  ON quorum_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = quorum_requests.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Service role can manage all quorum requests
CREATE POLICY "Service role can manage quorum requests"
  ON quorum_requests FOR ALL
  USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE TRIGGER update_quorum_requests_updated_at
  BEFORE UPDATE ON quorum_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE quorum_requests IS 'Multi-signature approval requests for high-value trades (P1-25)';

-- ============================================================================
-- PART 2: Onchain Capabilities on Trading Policies
-- ============================================================================

-- Add granular onchain capability flags to trading_policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_policies' AND column_name = 'onchain_capabilities'
  ) THEN
    ALTER TABLE trading_policies ADD COLUMN onchain_capabilities JSONB DEFAULT '{
      "swap": true,
      "transfer": false,
      "perp_trading": false,
      "bridge": false,
      "stake": false,
      "lend": false,
      "provide_liquidity": false
    }'::jsonb;
  END IF;

  -- Quorum threshold per policy (overrides org default)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_policies' AND column_name = 'quorum_threshold_usd'
  ) THEN
    ALTER TABLE trading_policies ADD COLUMN quorum_threshold_usd NUMERIC(18,2);
  END IF;

  -- Require user confirmation flag (for trades above a certain value)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_policies' AND column_name = 'require_confirmation_above_usd'
  ) THEN
    ALTER TABLE trading_policies ADD COLUMN require_confirmation_above_usd NUMERIC(18,2);
  END IF;
END $$;

COMMENT ON COLUMN trading_policies.onchain_capabilities IS 'Granular capability flags: swap, transfer, perp, bridge, stake, lend, LP';
COMMENT ON COLUMN trading_policies.quorum_threshold_usd IS 'USD threshold above which multi-sig quorum approval is required';
COMMENT ON COLUMN trading_policies.require_confirmation_above_usd IS 'USD threshold above which user confirmation is required before execution';