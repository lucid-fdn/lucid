-- Add integration_id to assistant_oauth_bindings
-- Nango integration ID (providerConfigKey). Defaults to provider name.
-- This allows multiple Nango integrations per provider (e.g. 'slack-v2').

ALTER TABLE assistant_oauth_bindings
  ADD COLUMN IF NOT EXISTS integration_id TEXT DEFAULT NULL;

-- Backfill: set integration_id = provider for existing rows
UPDATE assistant_oauth_bindings
  SET integration_id = provider
  WHERE integration_id IS NULL;

-- Update the RPC to return integration_id (must drop first — return type changed)
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
    ON c.connection_id = b.connection_id
    AND c.is_active = true
  WHERE b.assistant_id = p_assistant_id;
END;
$$;
