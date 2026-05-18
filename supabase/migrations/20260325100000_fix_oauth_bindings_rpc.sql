-- Fix get_assistant_oauth_bindings:
-- 1. Add integration_id column (was in 20260321130000 but never applied to DB)
-- 2. Fix RPC join: nango_connection_id (not connection_id)
-- 3. Fix RPC active check: revoked_at IS NULL (not is_active = true)

ALTER TABLE assistant_oauth_bindings
  ADD COLUMN IF NOT EXISTS integration_id TEXT DEFAULT NULL;

DROP FUNCTION IF EXISTS get_assistant_oauth_bindings(UUID);

CREATE OR REPLACE FUNCTION get_assistant_oauth_bindings(
  p_assistant_id UUID
)
RETURNS TABLE (
  id                            UUID,
  assistant_id                  UUID,
  provider                      TEXT,
  connection_id                 TEXT,
  integration_id                TEXT,
  enabled_actions               TEXT[],
  requires_confirmation_actions TEXT[],
  max_calls_per_run             INTEGER,
  allowed_resources             JSONB,
  metadata                      JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.assistant_id,
    b.provider,
    b.connection_id,
    COALESCE(b.integration_id, b.provider) AS integration_id,
    b.enabled_actions,
    b.requires_confirmation_actions,
    b.max_calls_per_run,
    b.allowed_resources,
    b.metadata
  FROM assistant_oauth_bindings b
  INNER JOIN ai_assistants a ON a.id = b.assistant_id
  INNER JOIN user_oauth_connections c
    ON c.nango_connection_id = b.connection_id
    AND c.revoked_at IS NULL
  WHERE b.assistant_id = p_assistant_id;
END;
$$;
