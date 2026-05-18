-- Migration 114: Agent Commerce provider connection upsert
-- Atomic provider-connection lifecycle reconciliation for Stripe ACS/OCA and future account-access rails.

CREATE OR REPLACE FUNCTION upsert_agent_commerce_connection(
  p_org_id UUID,
  p_provider TEXT,
  p_provider_connection_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_provider_account_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'pending',
  p_capabilities JSONB DEFAULT '[]'::jsonb,
  p_secret_ref TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS SETOF agent_commerce_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection agent_commerce_connections%ROWTYPE;
BEGIN
  IF p_provider_connection_id IS NULL OR length(trim(p_provider_connection_id)) = 0 THEN
    RAISE EXCEPTION 'Agent Commerce provider_connection_id is required for connection upsert';
  END IF;

  INSERT INTO agent_commerce_connections (
    org_id,
    user_id,
    provider,
    provider_account_id,
    provider_connection_id,
    status,
    capabilities,
    secret_ref,
    expires_at,
    metadata
  )
  VALUES (
    p_org_id,
    p_user_id,
    p_provider,
    p_provider_account_id,
    p_provider_connection_id,
    COALESCE(p_status, 'pending'),
    COALESCE(p_capabilities, '[]'::jsonb),
    p_secret_ref,
    p_expires_at,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (provider, provider_connection_id)
    WHERE provider_connection_id IS NOT NULL
  DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, agent_commerce_connections.user_id),
    provider_account_id = COALESCE(EXCLUDED.provider_account_id, agent_commerce_connections.provider_account_id),
    status = EXCLUDED.status,
    capabilities = CASE
      WHEN jsonb_typeof(EXCLUDED.capabilities) = 'array'
        AND jsonb_array_length(EXCLUDED.capabilities) > 0
        THEN EXCLUDED.capabilities
      ELSE agent_commerce_connections.capabilities
    END,
    secret_ref = COALESCE(EXCLUDED.secret_ref, agent_commerce_connections.secret_ref),
    expires_at = COALESCE(EXCLUDED.expires_at, agent_commerce_connections.expires_at),
    updated_at = now(),
    metadata = COALESCE(agent_commerce_connections.metadata, '{}'::jsonb)
      || COALESCE(EXCLUDED.metadata, '{}'::jsonb)
  WHERE agent_commerce_connections.org_id = EXCLUDED.org_id
  RETURNING *
  INTO v_connection;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent Commerce provider connection belongs to a different org';
  END IF;

  RETURN NEXT v_connection;
END;
$$;
