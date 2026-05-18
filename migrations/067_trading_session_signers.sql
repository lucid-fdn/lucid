-- ============================================================================
-- Trading Session Signers & Trading Policies
-- Adds multi-chain support to session signers and trading policy management
-- ============================================================================

-- ============================================================================
-- PART 1: Extend session_signer_permissions for multi-chain support
-- ============================================================================

-- Add chain_type column (ethereum, solana)
ALTER TABLE session_signer_permissions
ADD COLUMN IF NOT EXISTS chain_type TEXT NOT NULL DEFAULT 'ethereum'
  CHECK (chain_type IN ('ethereum', 'solana'));

-- Add chain_id column (1 for mainnet, 137 for polygon, mainnet-beta for Solana, etc.)
ALTER TABLE session_signer_permissions
ADD COLUMN IF NOT EXISTS chain_id TEXT;

-- Drop the existing unique constraint and recreate with chain_type
-- This allows the same wallet to have different permissions per chain
ALTER TABLE session_signer_permissions
DROP CONSTRAINT IF EXISTS session_signer_permissions_user_id_wallet_address_key;

ALTER TABLE session_signer_permissions
ADD CONSTRAINT session_signer_permissions_user_wallet_chain_key
  UNIQUE(user_id, wallet_address, chain_type);

-- Add index for chain_type lookups
CREATE INDEX IF NOT EXISTS idx_session_signer_chain_type
  ON session_signer_permissions(chain_type);

-- ============================================================================
-- PART 2: Trading Policies Table
-- Per-assistant trading configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS trading_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,

  -- Main toggle
  enabled BOOLEAN DEFAULT false,

  -- Value limits (in USD)
  max_trade_value_usd DECIMAL(18,2) DEFAULT 100.00,
  daily_limit_usd DECIMAL(18,2) DEFAULT 500.00,

  -- Allowed chains (array of chain types)
  -- e.g., ['ethereum', 'solana'] or ['ethereum']
  allowed_chains TEXT[] DEFAULT '{}',

  -- Allowed tokens per chain (JSONB for flexibility)
  -- Format: {"solana": ["SOL", "USDC", "BONK"], "ethereum": ["ETH", "USDC", "WETH"]}
  allowed_tokens JSONB DEFAULT '{}',

  -- Slippage tolerance in basis points (100 = 1%)
  max_slippage_bps INTEGER DEFAULT 100,

  -- Additional restrictions
  require_confirmation_above_usd DECIMAL(18,2) DEFAULT NULL, -- If set, trades above this need confirmation
  blocked_protocols TEXT[] DEFAULT '{}', -- e.g., ['pump.fun'] for risky protocols

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- One policy per assistant
  UNIQUE(assistant_id)
);

-- Create indexes for trading_policies
CREATE INDEX IF NOT EXISTS idx_trading_policies_assistant_id
  ON trading_policies(assistant_id);
CREATE INDEX IF NOT EXISTS idx_trading_policies_enabled
  ON trading_policies(enabled) WHERE enabled = true;

-- Enable RLS for trading_policies
ALTER TABLE trading_policies ENABLE ROW LEVEL SECURITY;

-- RLS: Users can manage trading policies for assistants they own
-- Assistants have org_id, so we check org membership
CREATE POLICY "Users can view trading policies for their org's assistants"
  ON trading_policies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE a.id = trading_policies.assistant_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert trading policies for their org's assistants"
  ON trading_policies
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE a.id = trading_policies.assistant_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can update trading policies for their org's assistants"
  ON trading_policies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE a.id = trading_policies.assistant_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can delete trading policies for their org's assistants"
  ON trading_policies
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE a.id = trading_policies.assistant_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Service role has full access
CREATE POLICY "Service role has full access to trading_policies"
  ON trading_policies
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 3: Trading Transactions Audit Log
-- Complete audit trail of all trading transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS trading_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and what
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,

  -- Chain info
  chain_type TEXT NOT NULL CHECK (chain_type IN ('ethereum', 'solana')),
  chain_id TEXT, -- '1', '137', 'mainnet-beta', etc.

  -- Transaction details
  tx_hash TEXT,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('swap', 'transfer', 'perp_order', 'perp_cancel')),

  -- For swaps
  input_token TEXT,
  input_amount TEXT, -- String to handle large numbers
  output_token TEXT,
  output_amount TEXT,

  -- For transfers
  recipient_address TEXT,

  -- For perps
  perp_market TEXT,
  perp_side TEXT CHECK (perp_side IN ('long', 'short') OR perp_side IS NULL),
  perp_size TEXT,
  perp_price TEXT,

  -- Value tracking
  value_usd DECIMAL(18,2),
  slippage_bps INTEGER,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed', 'rejected')),
  error_message TEXT,

  -- Metadata
  dex_used TEXT, -- 'jupiter', '1inch', 'hyperliquid', etc.
  tool_call_id TEXT, -- Reference to the agent tool call
  run_id TEXT, -- Reference to the agent run

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,

  -- Block info (for confirmed transactions)
  block_number BIGINT,
  block_timestamp TIMESTAMPTZ
);

-- Indexes for trading_transactions
CREATE INDEX IF NOT EXISTS idx_trading_tx_user_id
  ON trading_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_tx_assistant_id
  ON trading_transactions(assistant_id);
CREATE INDEX IF NOT EXISTS idx_trading_tx_status
  ON trading_transactions(status);
CREATE INDEX IF NOT EXISTS idx_trading_tx_created_at
  ON trading_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_tx_chain_type
  ON trading_transactions(chain_type);
CREATE INDEX IF NOT EXISTS idx_trading_tx_tx_hash
  ON trading_transactions(tx_hash) WHERE tx_hash IS NOT NULL;

-- Enable RLS for trading_transactions
ALTER TABLE trading_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own transactions
CREATE POLICY "Users can view their own trading transactions"
  ON trading_transactions
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can view transactions from assistants in their orgs
CREATE POLICY "Users can view org trading transactions"
  ON trading_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE a.id = trading_transactions.assistant_id
      AND om.user_id = auth.uid()
    )
  );

-- Only service role can insert/update (backend handles this)
CREATE POLICY "Service role can manage trading transactions"
  ON trading_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 4: Trading Daily Usage
-- Tracks daily trading volume for limit enforcement
-- ============================================================================

CREATE TABLE IF NOT EXISTS trading_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assistant_id UUID NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,

  -- Date partition
  usage_date DATE DEFAULT CURRENT_DATE,

  -- Aggregates
  total_volume_usd DECIMAL(18,2) DEFAULT 0,
  trade_count INTEGER DEFAULT 0,

  -- Per-type breakdown
  swap_count INTEGER DEFAULT 0,
  swap_volume_usd DECIMAL(18,2) DEFAULT 0,
  transfer_count INTEGER DEFAULT 0,
  transfer_volume_usd DECIMAL(18,2) DEFAULT 0,
  perp_count INTEGER DEFAULT 0,
  perp_volume_usd DECIMAL(18,2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- One row per user/assistant/day
  UNIQUE(user_id, assistant_id, usage_date)
);

-- Indexes for trading_daily_usage
CREATE INDEX IF NOT EXISTS idx_trading_daily_usage_user_id
  ON trading_daily_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_daily_usage_assistant_id
  ON trading_daily_usage(assistant_id);
CREATE INDEX IF NOT EXISTS idx_trading_daily_usage_date
  ON trading_daily_usage(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_trading_daily_usage_lookup
  ON trading_daily_usage(user_id, assistant_id, usage_date);

-- Enable RLS for trading_daily_usage
ALTER TABLE trading_daily_usage ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own usage
CREATE POLICY "Users can view their own trading usage"
  ON trading_daily_usage
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role can manage usage records
CREATE POLICY "Service role can manage trading usage"
  ON trading_daily_usage
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 5: Helper Functions
-- ============================================================================

-- Function to check if a trade is within policy limits
CREATE OR REPLACE FUNCTION check_trading_policy(
  p_assistant_id UUID,
  p_user_id UUID,
  p_chain_type TEXT,
  p_input_token TEXT,
  p_output_token TEXT,
  p_value_usd DECIMAL(18,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_policy RECORD;
  v_daily_usage DECIMAL(18,2);
  v_result JSONB;
BEGIN
  -- Get the trading policy for this assistant
  SELECT * INTO v_policy
  FROM trading_policies
  WHERE assistant_id = p_assistant_id;

  -- No policy = trading not enabled
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'No trading policy configured for this assistant'
    );
  END IF;

  -- Check if trading is enabled
  IF NOT v_policy.enabled THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Trading is disabled for this assistant'
    );
  END IF;

  -- Check chain is allowed
  IF NOT (p_chain_type = ANY(v_policy.allowed_chains)) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('Chain %s is not in allowed chains: %s', p_chain_type, array_to_string(v_policy.allowed_chains, ', '))
    );
  END IF;

  -- Check tokens are allowed (if allowlist is not empty)
  IF v_policy.allowed_tokens IS NOT NULL AND v_policy.allowed_tokens != '{}'::jsonb THEN
    -- Check input token
    IF v_policy.allowed_tokens ? p_chain_type THEN
      IF NOT (p_input_token = ANY(ARRAY(SELECT jsonb_array_elements_text(v_policy.allowed_tokens -> p_chain_type)))) THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'reason', format('Token %s is not in allowed tokens for chain %s', p_input_token, p_chain_type)
        );
      END IF;
      -- Check output token
      IF p_output_token IS NOT NULL AND NOT (p_output_token = ANY(ARRAY(SELECT jsonb_array_elements_text(v_policy.allowed_tokens -> p_chain_type)))) THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'reason', format('Token %s is not in allowed tokens for chain %s', p_output_token, p_chain_type)
        );
      END IF;
    END IF;
  END IF;

  -- Check single trade value
  IF p_value_usd > v_policy.max_trade_value_usd THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('Trade value $%.2f exceeds max single trade limit of $%.2f', p_value_usd, v_policy.max_trade_value_usd)
    );
  END IF;

  -- Check daily limit
  SELECT COALESCE(SUM(total_volume_usd), 0) INTO v_daily_usage
  FROM trading_daily_usage
  WHERE user_id = p_user_id
    AND assistant_id = p_assistant_id
    AND usage_date = CURRENT_DATE;

  IF (v_daily_usage + p_value_usd) > v_policy.daily_limit_usd THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('Trade would exceed daily limit. Used: $%.2f, Limit: $%.2f, Requested: $%.2f',
        v_daily_usage, v_policy.daily_limit_usd, p_value_usd),
      'daily_used', v_daily_usage,
      'daily_limit', v_policy.daily_limit_usd
    );
  END IF;

  -- Check if confirmation is required
  IF v_policy.require_confirmation_above_usd IS NOT NULL AND p_value_usd > v_policy.require_confirmation_above_usd THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'requires_confirmation', true,
      'reason', format('Trade value $%.2f exceeds confirmation threshold of $%.2f', p_value_usd, v_policy.require_confirmation_above_usd),
      'max_slippage_bps', v_policy.max_slippage_bps
    );
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'allowed', true,
    'requires_confirmation', false,
    'max_slippage_bps', v_policy.max_slippage_bps,
    'daily_remaining', v_policy.daily_limit_usd - v_daily_usage - p_value_usd
  );
END;
$$;

-- Function to record a trade and update daily usage
CREATE OR REPLACE FUNCTION record_trade(
  p_user_id UUID,
  p_assistant_id UUID,
  p_chain_type TEXT,
  p_chain_id TEXT,
  p_tx_hash TEXT,
  p_tx_type TEXT,
  p_input_token TEXT,
  p_input_amount TEXT,
  p_output_token TEXT,
  p_output_amount TEXT,
  p_value_usd DECIMAL(18,2),
  p_slippage_bps INTEGER,
  p_status TEXT,
  p_dex_used TEXT,
  p_tool_call_id TEXT,
  p_run_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tx_id UUID;
BEGIN
  -- Insert the transaction record
  INSERT INTO trading_transactions (
    user_id, assistant_id, chain_type, chain_id,
    tx_hash, tx_type, input_token, input_amount,
    output_token, output_amount, value_usd, slippage_bps,
    status, dex_used, tool_call_id, run_id
  ) VALUES (
    p_user_id, p_assistant_id, p_chain_type, p_chain_id,
    p_tx_hash, p_tx_type, p_input_token, p_input_amount,
    p_output_token, p_output_amount, p_value_usd, p_slippage_bps,
    p_status, p_dex_used, p_tool_call_id, p_run_id
  )
  RETURNING id INTO v_tx_id;

  -- Update daily usage (upsert)
  INSERT INTO trading_daily_usage (
    user_id, assistant_id, usage_date,
    total_volume_usd, trade_count,
    swap_count, swap_volume_usd,
    transfer_count, transfer_volume_usd,
    perp_count, perp_volume_usd
  ) VALUES (
    p_user_id, p_assistant_id, CURRENT_DATE,
    p_value_usd, 1,
    CASE WHEN p_tx_type = 'swap' THEN 1 ELSE 0 END,
    CASE WHEN p_tx_type = 'swap' THEN p_value_usd ELSE 0 END,
    CASE WHEN p_tx_type = 'transfer' THEN 1 ELSE 0 END,
    CASE WHEN p_tx_type = 'transfer' THEN p_value_usd ELSE 0 END,
    CASE WHEN p_tx_type IN ('perp_order', 'perp_cancel') THEN 1 ELSE 0 END,
    CASE WHEN p_tx_type IN ('perp_order', 'perp_cancel') THEN p_value_usd ELSE 0 END
  )
  ON CONFLICT (user_id, assistant_id, usage_date)
  DO UPDATE SET
    total_volume_usd = trading_daily_usage.total_volume_usd + EXCLUDED.total_volume_usd,
    trade_count = trading_daily_usage.trade_count + 1,
    swap_count = trading_daily_usage.swap_count + EXCLUDED.swap_count,
    swap_volume_usd = trading_daily_usage.swap_volume_usd + EXCLUDED.swap_volume_usd,
    transfer_count = trading_daily_usage.transfer_count + EXCLUDED.transfer_count,
    transfer_volume_usd = trading_daily_usage.transfer_volume_usd + EXCLUDED.transfer_volume_usd,
    perp_count = trading_daily_usage.perp_count + EXCLUDED.perp_count,
    perp_volume_usd = trading_daily_usage.perp_volume_usd + EXCLUDED.perp_volume_usd,
    updated_at = now();

  RETURN v_tx_id;
END;
$$;

-- ============================================================================
-- PART 6: Updated_at Triggers
-- ============================================================================

-- Trigger for trading_policies
CREATE TRIGGER update_trading_policies_updated_at
  BEFORE UPDATE ON trading_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for trading_daily_usage
CREATE TRIGGER update_trading_daily_usage_updated_at
  BEFORE UPDATE ON trading_daily_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: Comments
-- ============================================================================

COMMENT ON TABLE trading_policies IS 'Per-assistant trading policy configuration (limits, allowed tokens/chains)';
COMMENT ON TABLE trading_transactions IS 'Audit log of all trading transactions executed by agents';
COMMENT ON TABLE trading_daily_usage IS 'Daily aggregated trading usage for limit enforcement';

COMMENT ON FUNCTION check_trading_policy IS 'Validates a trade against the assistant trading policy and daily limits';
COMMENT ON FUNCTION record_trade IS 'Records a trade and updates daily usage atomically';
