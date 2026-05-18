-- Add an RPC to atomically merge a single key into the channel_config JSONB column.
-- Used by the Teams webhook to persist the latest serviceUrl without overwriting
-- other channel_config keys (e.g. hosted, discord_guild_id).

CREATE OR REPLACE FUNCTION jsonb_set_channel_config(
  p_channel_id UUID,
  p_key TEXT,
  p_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE assistant_channels
  SET channel_config = COALESCE(channel_config, '{}'::jsonb) || jsonb_build_object(p_key, p_value::jsonb)
  WHERE id = p_channel_id;
END;
$$;

-- Only service_role should call this (webhook handler uses supabase service client)
REVOKE EXECUTE ON FUNCTION jsonb_set_channel_config(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jsonb_set_channel_config(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION jsonb_set_channel_config(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION jsonb_set_channel_config(UUID, TEXT, TEXT) TO service_role;
