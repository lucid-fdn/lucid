-- ============================================================================
-- Trading System P0 Hardening
-- Adds privy_wallet_id, ownership metadata, system_config, indexes, expiry
-- ============================================================================

-- ============================================================================
-- PART 1: Add privy_wallet_id + ownership metadata to session_signer_permissions
-- ============================================================================

ALTER TABLE session_signer_permissions
  ADD COLUMN IF NOT EXISTS privy_wallet_id TEXT,
  ADD COLUMN IF NOT EXISTS privy_user_id TEXT,
  ADD COLUMN IF NOT EXISTS wallet_owner_id TEXT,
  ADD COLUMN IF NOT EXISTS wallet_owner_kind TEXT CHECK (wallet_owner_kind IN ('auth_key', 'key_quorum', 'user', 'unknown')),
  ADD COLUMN IF NOT EXISTS can_autotrade_computed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS eligibility_reason TEXT,
  ADD COLUMN IF NOT EXISTS wallet_type TEXT DEFAULT 'embedded' CHECK (wallet_type IN ('embedded', 'external')),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add privy_wallet_id to trading_transactions for audit correlation
ALTER TABLE trading_transactions
  ADD COLUMN IF NOT EXISTS privy_wallet_id TEXT,
  ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Index for lookup by privy_wallet_id
CREATE INDEX IF NOT EXISTS idx_ssp_privy_wallet_id
  ON session_signer_permissions(privy_wallet_id) WHERE privy_wallet_id IS NOT NULL;

-- ============================================================================
-- PART 2: Composite indexes for hot query paths
-- ============================================================================

-- Trading history queries (user + assistant + time)
CREATE INDEX IF NOT EXISTS idx_trading_tx_user_assistant_created
  ON trading_transactions(user_id, assistant_id, created_at DESC);

-- Stuck transaction monitoring
CREATE INDEX IF NOT EXISTS idx_trading_tx_pending_status
  ON trading_transactions(status, created_at)
  WHERE status IN ('pending', 'submitted');

-- ============================================================================
-- PART 3: CHECK constraints for value sanity
-- ============================================================================

-- Ensure trading policy values are positive
ALTER TABLE trading_policies
  ADD CONSTRAINT chk_max_trade_value_positive CHECK (max_trade_value_usd > 0),
  ADD CONSTRAINT chk_daily_limit_positive CHECK (daily_limit_usd > 0);

-- Ensure transaction values are non-negative
ALTER TABLE trading_transactions
  ADD CONSTRAINT chk_value_usd_nonneg CHECK (value_usd >= 0 OR value_usd IS NULL);

-- ============================================================================
-- PART 4: System Config table (global kill switch + settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  description TEXT
);

-- Insert global trading kill switch (default: enabled for safety = OFF)
INSERT INTO system_config (key, value, description)
VALUES (
  'trading_global_enabled',
  'false'::jsonb,
  'Global kill switch for all autonomous trading. Set to true to enable trading platform-wide.'
)
ON CONFLICT (key) DO NOTHING;

-- Insert default trading limits
INSERT INTO system_config (key, value, description)
VALUES (
  'trading_default_limits',
  '{"max_trade_value_usd": 100, "daily_limit_usd": 500, "max_slippage_bps": 100}'::jsonb,
  'Default trading limits applied when creating new trading policies'
)
ON CONFLICT (key) DO NOTHING;

-- RLS for system_config
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read system_config
CREATE POLICY "Anyone can read system_config"
  ON system_config FOR SELECT USING (true);

-- Only service role can modify
CREATE POLICY "Service role can manage system_config"
  ON system_config FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 5: Per-user trading suspension
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trading_suspended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trading_suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trading_suspended_reason TEXT;

-- ============================================================================
-- PART 6: Session signer audit log
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_signer_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  privy_wallet_id TEXT,
  wallet_address TEXT,
  chain_type TEXT,
  action TEXT NOT NULL CHECK (action IN ('enable', 'revoke', 'sign', 'broadcast', 'fail')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssa_user_id ON session_signer_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_ssa_created_at ON session_signer_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssa_action ON session_signer_audit(action);

ALTER TABLE session_signer_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own signer audit"
  ON session_signer_audit FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage signer audit"
  ON session_signer_audit FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 7: Request deduplication table (for HMAC replay protection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS request_dedup (
  request_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-cleanup old entries (keep 1 hour)
CREATE INDEX IF NOT EXISTS idx_request_dedup_created
  ON request_dedup(created_at);

-- ============================================================================
-- PART 8: Comments
-- ============================================================================

COMMENT ON TABLE system_config IS 'System-wide configuration including trading global kill switch';
COMMENT ON TABLE session_signer_audit IS 'Audit log for session signer enable/revoke/sign actions';
COMMENT ON TABLE request_dedup IS 'Request ID deduplication for replay protection on internal APIs';
COMMENT ON COLUMN session_signer_permissions.privy_wallet_id IS 'Privy canonical wallet ID (use for signing API calls)';
COMMENT ON COLUMN session_signer_permissions.wallet_owner_kind IS 'Type of wallet owner: auth_key, key_quorum, user, unknown';
COMMENT ON COLUMN session_signer_permissions.can_autotrade_computed IS 'Computed: true when owner is server-controlled (auth_key/key_quorum)';
COMMENT ON COLUMN session_signer_permissions.expires_at IS 'Permission expiry time (default 30 days from enable)';