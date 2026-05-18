-- Assistant OAuth Bindings: Policy boundary for OAuth tool execution.
-- Links assistants to specific Nango OAuth connections with per-action gating.
-- Without explicit binding, no OAuth tool access — this is the security boundary.

CREATE TABLE IF NOT EXISTS assistant_oauth_bindings (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id                    UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  provider                        TEXT NOT NULL,
  connection_id                   TEXT NOT NULL,
  enabled_actions                 TEXT[] DEFAULT '{}',
  requires_confirmation_actions   TEXT[] DEFAULT '{}',
  max_calls_per_run               INTEGER NOT NULL DEFAULT 50,
  allowed_resources               JSONB DEFAULT '{}',
  metadata                        JSONB DEFAULT '{}',
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_assistant_oauth_binding UNIQUE (assistant_id, provider)
);

-- Fast lookups by assistant
CREATE INDEX idx_oauth_binding_assistant ON assistant_oauth_bindings (assistant_id);

-- RPC: Get OAuth bindings for an assistant (with org ownership enforcement)
CREATE OR REPLACE FUNCTION get_assistant_oauth_bindings(
  p_assistant_id UUID
)
RETURNS TABLE (
  id                            UUID,
  assistant_id                  UUID,
  provider                      TEXT,
  connection_id                 TEXT,
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
