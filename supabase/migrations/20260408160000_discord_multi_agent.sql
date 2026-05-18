-- ============================================================================
-- Discord Multi-Agent Shared Bot
--
-- Makes the shared Lucid Discord bot multi-agent safe. One Discord guild can
-- be bound to several agents, but exactly one is "primary" at a time.
-- Mirrors the Telegram multi-agent model (20260407100000 / 20260407130000 /
-- 20260407140000) scoped to channel_type='discord'.
--
-- Note: `is_primary` column was already added by the telegram migration
-- (20260407100000). We only add the discord-scoped partial unique index,
-- the share flag on ai_assistants, the deterministic backfill, and the
-- atomic swap RPC.
--
-- Spec / Plan: docs/plans/2026-04-08-discord-byob-and-shared-bot.md
-- ============================================================================

-- 1. Partial unique index: at most one primary per (channel_type, external_channel_id)
--    scoped to discord. The telegram index stays as-is; the two indexes do
--    not overlap because of the channel_type filter.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_channels_primary_per_guild
  ON assistant_channels (channel_type, external_channel_id)
  WHERE is_primary = true AND is_active = true AND channel_type = 'discord';

-- 2. Add discord_share_enabled on ai_assistants (default false — opt-in)
ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS discord_share_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_assistants.discord_share_enabled IS
  'When true, the agent can be reached via the public Discord OAuth install flow on the shared Lucid bot. Off by default to prevent accidental exposure.';

-- 3. Backfill primaries deterministically for existing discord bindings.
--    For every guild with one or more active discord rows, promote the
--    most-recently-updated row to primary. Day-one behavior preserved.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY external_channel_id
           ORDER BY updated_at DESC
         ) AS rn
    FROM assistant_channels
   WHERE channel_type = 'discord'
     AND is_active = true
     AND external_channel_id IS NOT NULL
)
UPDATE assistant_channels c
   SET is_primary = (r.rn = 1)
  FROM ranked r
 WHERE c.id = r.id;

-- 4. Atomic primary swap RPC for discord. Same shape as
--    set_telegram_chat_primary — advisory lock + optional share recheck +
--    demote-then-promote. SECURITY DEFINER, service_role only.
CREATE OR REPLACE FUNCTION set_discord_guild_primary(
  p_guild_id TEXT,
  p_assistant_id UUID,
  p_require_share_enabled BOOLEAN DEFAULT false
)
RETURNS TABLE(channel_id UUID, assistant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Serialize concurrent swaps for the same guild. Released at txn end.
  PERFORM pg_advisory_xact_lock(hashtext('discord:primary:' || p_guild_id));

  IF p_require_share_enabled THEN
    IF NOT EXISTS (
      SELECT 1
        FROM assistant_channels c
        JOIN ai_assistants a ON a.id = c.assistant_id
       WHERE c.channel_type = 'discord'
         AND c.is_active = true
         AND c.external_channel_id = p_guild_id
         AND c.assistant_id = p_assistant_id
         AND a.discord_share_enabled = true
    ) THEN
      RETURN;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM assistant_channels
       WHERE channel_type = 'discord'
         AND is_active = true
         AND external_channel_id = p_guild_id
         AND assistant_channels.assistant_id = p_assistant_id
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Demote every other primary for this guild first (avoids unique conflict)
  UPDATE assistant_channels
     SET is_primary = false
   WHERE channel_type = 'discord'
     AND is_active = true
     AND external_channel_id = p_guild_id
     AND is_primary = true
     AND assistant_channels.assistant_id <> p_assistant_id;

  -- Promote the target
  UPDATE assistant_channels
     SET is_primary = true
   WHERE channel_type = 'discord'
     AND is_active = true
     AND external_channel_id = p_guild_id
     AND assistant_channels.assistant_id = p_assistant_id;

  RETURN QUERY
    SELECT id, assistant_channels.assistant_id
      FROM assistant_channels
     WHERE channel_type = 'discord'
       AND is_active = true
       AND external_channel_id = p_guild_id
       AND assistant_channels.assistant_id = p_assistant_id
     LIMIT 1;
END;
$$;

COMMENT ON FUNCTION set_discord_guild_primary IS
  'Atomically makes the given assistant the primary speaker for a Discord guild. Demotes all other active rows for the same external_channel_id, then promotes the target. Holds an advisory lock on the guild. When p_require_share_enabled=true, also verifies ai_assistants.discord_share_enabled=true at promote time.';

REVOKE EXECUTE ON FUNCTION set_discord_guild_primary(TEXT, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_discord_guild_primary(TEXT, UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION set_discord_guild_primary(TEXT, UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_discord_guild_primary(TEXT, UUID, BOOLEAN) TO service_role;
