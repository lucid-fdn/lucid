-- OAuth Connections: Local mirror of Nango connections for ownership verification + stats
-- Nango remains source of truth for tokens; this table enables:
--   1. Server-side ownership verification on disconnect
--   2. Connection usage stats (totalCalls, successRate, lastUsed)
--   3. Fast local reads without hitting Nango API

CREATE TABLE IF NOT EXISTS user_oauth_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,                -- Privy DID (end_user.endUserId from Nango webhook)
  provider        TEXT NOT NULL,                -- e.g. 'twitter', 'slack', 'google-sheets'
  connection_id   TEXT NOT NULL,                -- Nango connectionId (unique per connection)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  total_calls     INTEGER NOT NULL DEFAULT 0,
  successful_calls INTEGER NOT NULL DEFAULT 0,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_oauth_connection UNIQUE (connection_id)
);

-- Fast lookups by user
CREATE INDEX idx_oauth_conn_user_id ON user_oauth_connections (user_id);
-- Fast lookups by user + provider
CREATE INDEX idx_oauth_conn_user_provider ON user_oauth_connections (user_id, provider) WHERE is_active = true;

-- RPC: Upsert connection (idempotent — safe to call from both webhook + sync)
CREATE OR REPLACE FUNCTION upsert_oauth_connection(
  p_user_id       TEXT,
  p_provider      TEXT,
  p_connection_id TEXT,
  p_metadata      JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO user_oauth_connections (user_id, provider, connection_id, metadata, is_active, connected_at)
  VALUES (p_user_id, p_provider, p_connection_id, p_metadata, true, now())
  ON CONFLICT (connection_id) DO UPDATE SET
    is_active = true,
    disconnected_at = NULL,
    metadata = COALESCE(NULLIF(p_metadata::TEXT, '{}'), user_oauth_connections.metadata::TEXT)::JSONB,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- RPC: Soft-delete connection
CREATE OR REPLACE FUNCTION delete_oauth_connection(
  p_user_id       TEXT,
  p_connection_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE user_oauth_connections
  SET is_active = false, disconnected_at = now(), updated_at = now()
  WHERE connection_id = p_connection_id
    AND user_id = p_user_id
    AND is_active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- RPC: Verify connection ownership (used before disconnect)
CREATE OR REPLACE FUNCTION verify_oauth_connection_owner(
  p_user_id       TEXT,
  p_connection_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_oauth_connections
    WHERE connection_id = p_connection_id
      AND user_id = p_user_id
      AND is_active = true
  );
END;
$$;

-- RPC: Increment usage stats (called after each proxy/resource call)
CREATE OR REPLACE FUNCTION increment_oauth_usage(
  p_connection_id TEXT,
  p_success       BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_oauth_connections
  SET
    total_calls = total_calls + 1,
    successful_calls = CASE WHEN p_success THEN successful_calls + 1 ELSE successful_calls END,
    last_used_at = now(),
    updated_at = now()
  WHERE connection_id = p_connection_id
    AND is_active = true;
END;
$$;

-- RPC: Get connection stats for a user + provider
CREATE OR REPLACE FUNCTION get_oauth_connection_stats(
  p_user_id  TEXT,
  p_provider TEXT
)
RETURNS TABLE (
  connection_id   TEXT,
  total_calls     INTEGER,
  successful_calls INTEGER,
  last_used_at    TIMESTAMPTZ,
  connected_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.connection_id,
    c.total_calls,
    c.successful_calls,
    c.last_used_at,
    c.connected_at
  FROM user_oauth_connections c
  WHERE c.user_id = p_user_id
    AND c.provider = p_provider
    AND c.is_active = true;
END;
$$;
