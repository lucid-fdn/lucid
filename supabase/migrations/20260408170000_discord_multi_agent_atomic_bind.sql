-- ============================================================================
-- Discord Multi-Agent — atomic hosted bind
--
-- Mirrors 20260407140000_telegram_multi_agent_atomic_bind.sql for Discord.
--
-- Collapses the hosted-row upsert, the share-flag check, and the primary
-- swap into a single SECURITY DEFINER transaction that holds:
--   (a) an advisory lock on the destination guild (prevents concurrent
--       binds on the same guild from interleaving), and
--   (b) a SELECT FOR UPDATE on the assistant row (prevents a concurrent
--       flip of discord_share_enabled from landing between the check
--       and the write).
--
-- Returns (channel_id, assistant_id) on success, empty on failure.
-- ============================================================================

CREATE OR REPLACE FUNCTION bind_hosted_discord_channel(
  p_assistant_id UUID,
  p_guild_id TEXT,
  p_secret_token TEXT,
  p_require_share_enabled BOOLEAN DEFAULT false
)
RETURNS TABLE(channel_id UUID, assistant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_share_enabled BOOLEAN;
  v_existing_id UUID;
  v_channel_id UUID;
  v_channel_config JSONB;
BEGIN
  -- Serialize concurrent binds/switches on the same guild
  PERFORM pg_advisory_xact_lock(hashtext('discord:primary:' || p_guild_id));

  -- Row-lock the assistant so a concurrent flip of discord_share_enabled
  -- on another connection blocks until we commit/rollback. Prevents the
  -- "flag flipped mid-bind" race.
  SELECT discord_share_enabled
    INTO v_share_enabled
    FROM ai_assistants
   WHERE id = p_assistant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_require_share_enabled AND COALESCE(v_share_enabled, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  v_channel_config := jsonb_build_object(
    'discord_guild_id', p_guild_id,
    'hosted', true
  );

  -- Look for an existing hosted row for this assistant. Only rows flagged
  -- with channel_config->>'hosted' = 'true' qualify — BYOB discord rows
  -- (DiscordNativeAdapter on dedicated runtimes) coexist independently and
  -- must never be clobbered.
  SELECT c.id
    INTO v_existing_id
    FROM assistant_channels c
   WHERE c.assistant_id = p_assistant_id
     AND c.channel_type = 'discord'
     AND c.is_active = true
     AND (c.channel_config->>'hosted') = 'true'
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Reuse the existing hosted row. Clear is_primary because the guild may
    -- have moved — any primary status in the old guild must be dropped
    -- before the swap below re-establishes primary in the new guild.
    UPDATE assistant_channels AS c
       SET is_active = true,
           channel_config = v_channel_config,
           external_channel_id = p_guild_id,
           is_primary = false
     WHERE c.id = v_existing_id;
    v_channel_id := v_existing_id;
  ELSE
    INSERT INTO assistant_channels (
      assistant_id,
      channel_type,
      secret_token_hash,
      external_channel_id,
      is_active,
      is_primary,
      channel_config
    ) VALUES (
      p_assistant_id,
      'discord',
      p_secret_token,
      p_guild_id,
      true,
      false,
      v_channel_config
    )
    RETURNING id INTO v_channel_id;
  END IF;

  -- Demote any other primary row on this guild
  UPDATE assistant_channels AS c
     SET is_primary = false
   WHERE c.channel_type = 'discord'
     AND c.is_active = true
     AND c.external_channel_id = p_guild_id
     AND c.is_primary = true
     AND c.assistant_id <> p_assistant_id;

  -- Promote the target row (uniqueness guaranteed by
  -- idx_assistant_channels_primary_per_guild, serialized by advisory lock)
  UPDATE assistant_channels AS c
     SET is_primary = true
   WHERE c.id = v_channel_id;

  RETURN QUERY SELECT v_channel_id, p_assistant_id;
END;
$$;

COMMENT ON FUNCTION bind_hosted_discord_channel IS
  'Atomically upserts a hosted Discord channel for (assistant, guild) and promotes it to primary. Holds a guild-scoped advisory lock and a FOR UPDATE lock on the assistant row so a concurrent flip of discord_share_enabled cannot interleave. Returns (channel_id, assistant_id) on success, empty row on failure (agent missing / share flag off when required).';

REVOKE EXECUTE ON FUNCTION bind_hosted_discord_channel(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bind_hosted_discord_channel(UUID, TEXT, TEXT, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION bind_hosted_discord_channel(UUID, TEXT, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION bind_hosted_discord_channel(UUID, TEXT, TEXT, BOOLEAN) TO service_role;
