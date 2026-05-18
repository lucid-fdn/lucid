-- Fix get_assistant_oauth_bindings:
-- The INNER JOIN to user_oauth_connections was broken because:
--   1. The upsert_oauth_connection RPC was never applied to DB, so no rows exist
--   2. The table schema differs from migration files (nango_connection_id vs connection_id)
--
-- Solution: Remove the INNER JOIN entirely.
-- The binding row in assistant_oauth_bindings IS the proof of connection.
-- It's created by the verify route after successful Nango OAuth.
-- No need to cross-check against user_oauth_connections.

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
  WHERE b.assistant_id = p_assistant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_assistant_oauth_bindings TO service_role;
