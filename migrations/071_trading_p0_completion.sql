-- Migration 071: Trading P0 Completion
-- Adds: ownership metadata columns, system_config, request_dedup, indexes, price_cache

-- ============================================================================
-- 1. System Config table (for global kill switch)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false',
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the trading kill switch (disabled by default)
INSERT INTO system_config (key, value, updated_at)
VALUES ('trading_global_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 2. Request deduplication table (for HMAC replay protection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS request_dedup (
  request_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup old dedup entries (older than 5 minutes)
CREATE INDEX IF NOT EXISTS idx_request_dedup_created_at ON request_dedup(created_at);

-- ============================================================================
-- 3. Add ownership metadata to session_signer_permissions
-- ============================================================================

DO $$
BEGIN
  -- privy_wallet_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_signer_permissions' AND column_name = 'privy_wallet_id'
  ) THEN
    ALTER TABLE session_signer_permissions ADD COLUMN privy_wallet_id TEXT;
  END IF;

  -- privy_user_id (Privy DID for audit correlation)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_signer_permissions' AND column_name = 'privy_user_id'
  ) THEN
    ALTER TABLE session_signer_permissions ADD COLUMN privy_user_id TEXT;
  END IF;

  -- wallet_owner_id (raw owner_id from Privy)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_signer_permissions' AND column_name = 'wallet_owner_id'
  ) THEN
    ALTER TABLE session_signer_permissions ADD COLUMN wallet_owner_id TEXT;
  END IF;

  -- wallet_owner_kind
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_signer_permissions' AND column_name = 'wallet_owner_kind'
  ) THEN
    ALTER TABLE session_signer_permissions ADD COLUMN wallet_owner_kind TEXT
      CHECK (wallet_owner_kind IN ('auth_key', 'key_quorum', 'user', 'unknown'));
  END IF;

  -- can_autotrade_computed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_signer_permissions' AND column_name = 'can_autotrade_computed'
  ) THEN
    ALTER TABLE session_signer_permissions ADD COLUMN can_autotrade_computed BOOLEAN DEFAULT false;
  END IF;

  -- eligibility_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_signer_permissions' AND column_name = 'eligibility_reason'
  ) THEN
    ALTER TABLE session_signer_permissions ADD COLUMN eligibility_reason TEXT;
  END IF;

  -- wallet_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_signer_permissions' AND column_name = 'wallet_type'
  ) THEN
    ALTER TABLE session_signer_permissions ADD COLUMN wallet_type TEXT DEFAULT 'embedded'
      CHECK (wallet_type IN ('embedded', 'external'));
  END IF;
END $$;

-- Add privy_wallet_id to trading_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_transactions' AND column_name = 'privy_wallet_id'
  ) THEN
    ALTER TABLE trading_transactions ADD COLUMN privy_wallet_id TEXT;
  END IF;

  -- confirmation_attempts for TX poller
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_transactions' AND column_name = 'confirmation_attempts'
  ) THEN
    ALTER TABLE trading_transactions ADD COLUMN confirmation_attempts INT DEFAULT 0;
  END IF;

  -- confirmed_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_transactions' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE trading_transactions ADD COLUMN confirmed_at TIMESTAMPTZ;
  END IF;

  -- block_number for EVM confirmations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_transactions' AND column_name = 'block_number'
  ) THEN
    ALTER TABLE trading_transactions ADD COLUMN block_number BIGINT;
  END IF;
END $$;

-- Add trading_suspended to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'trading_suspended'
  ) THEN
    ALTER TABLE profiles ADD COLUMN trading_suspended BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ============================================================================
-- 4. Indexes on hot query paths
-- ============================================================================

-- Trading transactions: history queries
CREATE INDEX IF NOT EXISTS idx_trading_tx_user_assistant_created
  ON trading_transactions(user_id, assistant_id, created_at DESC);

-- Trading transactions: stuck tx monitoring (partial index)
CREATE INDEX IF NOT EXISTS idx_trading_tx_pending
  ON trading_transactions(status, created_at)
  WHERE status IN ('pending', 'submitted');

-- Session signer permissions: lookup by privy_wallet_id
CREATE INDEX IF NOT EXISTS idx_ssp_privy_wallet_id
  ON session_signer_permissions(privy_wallet_id)
  WHERE privy_wallet_id IS NOT NULL;

-- Session signer permissions: eligibility queries
CREATE INDEX IF NOT EXISTS idx_ssp_autotrade
  ON session_signer_permissions(user_id, can_autotrade_computed)
  WHERE can_autotrade_computed = true AND enabled = true;

-- ============================================================================
-- 5. Price cache table (for live price oracle)
-- ============================================================================

CREATE TABLE IF NOT EXISTS price_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_symbol TEXT NOT NULL,
  chain TEXT NOT NULL,
  price_usd NUMERIC(20, 8) NOT NULL,
  source TEXT NOT NULL DEFAULT 'coingecko',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(token_symbol, chain)
);

CREATE INDEX IF NOT EXISTS idx_price_cache_lookup
  ON price_cache(token_symbol, chain, expires_at);

-- ============================================================================
-- 6. CHECK constraints on trading tables
-- ============================================================================

DO $$
BEGIN
  -- value_usd >= 0 on trading_transactions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'trading_transactions_value_usd_positive'
  ) THEN
    BEGIN
      ALTER TABLE trading_transactions
        ADD CONSTRAINT trading_transactions_value_usd_positive CHECK (value_usd >= 0);
    EXCEPTION WHEN others THEN
      NULL; -- Constraint may already exist under different name
    END;
  END IF;
END $$;

-- ============================================================================
-- 7. Cleanup function for request_dedup (call via pg_cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_request_dedup()
RETURNS void AS $$
BEGIN
  DELETE FROM request_dedup WHERE created_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for price_cache
CREATE OR REPLACE FUNCTION cleanup_expired_prices()
RETURNS void AS $$
BEGIN
  DELETE FROM price_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. RLS policies
-- ============================================================================

-- system_config: only service role can write
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_config_read_all ON system_config
  FOR SELECT USING (true);

CREATE POLICY system_config_write_service ON system_config
  FOR ALL USING (auth.role() = 'service_role');

-- request_dedup: only service role
ALTER TABLE request_dedup ENABLE ROW LEVEL SECURITY;

CREATE POLICY request_dedup_service ON request_dedup
  FOR ALL USING (auth.role() = 'service_role');

-- price_cache: read for all authenticated, write for service role
ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_cache_read ON price_cache
  FOR SELECT USING (true);

CREATE POLICY price_cache_write_service ON price_cache
  FOR ALL USING (auth.role() = 'service_role');