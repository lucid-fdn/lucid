CREATE TABLE IF NOT EXISTS channel_provider_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL,
  org_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
  node_key_hash TEXT NOT NULL UNIQUE,
  label TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  version TEXT NULL,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat_at TIMESTAMPTZ NULL,
  last_probe_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_provider_nodes_channel_status
  ON channel_provider_nodes (channel_type, status);

CREATE TABLE IF NOT EXISTS channel_provider_surfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_node_id UUID NULL REFERENCES channel_provider_nodes(id) ON DELETE SET NULL,
  surface_owner_id TEXT NOT NULL,
  display_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  secret_token_hash TEXT NULL,
  last_heartbeat_at TIMESTAMPTZ NULL,
  last_probe_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_provider_surfaces_channel_owner
  ON channel_provider_surfaces (channel_type, org_id, surface_owner_id);

CREATE INDEX IF NOT EXISTS idx_channel_provider_surfaces_status
  ON channel_provider_surfaces (channel_type, status);

CREATE TABLE IF NOT EXISTS channel_provider_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL,
  surface_id UUID NOT NULL REFERENCES channel_provider_surfaces(id) ON DELETE CASCADE,
  assistant_outbound_event_id UUID NOT NULL REFERENCES assistant_outbound_events(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claimed_by_node_id UUID NULL REFERENCES channel_provider_nodes(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  external_message_id TEXT NULL,
  delivered_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_provider_dispatches_outbound
  ON channel_provider_dispatches (assistant_outbound_event_id);

CREATE INDEX IF NOT EXISTS idx_channel_provider_dispatches_claim
  ON channel_provider_dispatches (channel_type, surface_id, status, created_at);

CREATE OR REPLACE FUNCTION claim_next_channel_provider_dispatch(
  p_channel_type TEXT,
  p_surface_id UUID,
  p_node_id UUID
)
RETURNS SETOF channel_provider_dispatches
LANGUAGE plpgsql
AS $$
DECLARE
  v_dispatch_id UUID;
BEGIN
  SELECT d.id
    INTO v_dispatch_id
  FROM channel_provider_dispatches d
  WHERE d.channel_type = p_channel_type
    AND d.surface_id = p_surface_id
    AND d.status IN ('pending', 'retry')
  ORDER BY d.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_dispatch_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE channel_provider_dispatches d
     SET status = 'claimed',
         claimed_by_node_id = p_node_id,
         claimed_at = NOW(),
         attempt_count = d.attempt_count + 1,
         updated_at = NOW()
   WHERE d.id = v_dispatch_id
   RETURNING d.*;
END;
$$;
