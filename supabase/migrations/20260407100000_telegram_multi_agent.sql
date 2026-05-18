-- ============================================================================
-- Telegram Multi-Agent Deep Link
--
-- Makes the shared @LucidBot multi-agent safe. One Telegram chat can be bound
-- to several agents, but exactly one is "primary" at a time. Switching is a
-- single transaction (demote all + promote target). The webhook routes inbound
-- messages by primary, never by ORDER BY updated_at DESC.
--
-- Spec:  docs/superpowers/specs/2026-04-07-telegram-multi-agent-deep-link-design.md
-- Plan:  docs/superpowers/plans/2026-04-07-telegram-multi-agent-deep-link-plan.md
-- ============================================================================

-- 1. Add is_primary flag on assistant_channels (default false)
ALTER TABLE assistant_channels
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE assistant_channels
  ADD COLUMN IF NOT EXISTS channel_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN assistant_channels.is_primary IS
  'For shared-bot channels (e.g. hosted Telegram), marks which agent currently receives messages for a given external_channel_id. Exactly one primary per chat is enforced by idx_assistant_channels_primary_per_chat.';

-- 2. Partial unique index: at most one primary per (channel_type, external_channel_id)
--    Scoped to telegram only — other channel types are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_channels_primary_per_chat
  ON assistant_channels (channel_type, external_channel_id)
  WHERE is_primary = true AND is_active = true AND channel_type = 'telegram';

-- 3. Add telegram_share_enabled on ai_assistants (default false — opt-in)
ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS telegram_share_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_assistants.telegram_share_enabled IS
  'When true, the agent can be reached via the public deep link t.me/<bot>?start=agent_<id>. Off by default to prevent accidental exposure.';

-- 4. Backfill primaries deterministically.
--    For every chat with one or more active telegram bindings, promote the
--    most-recently-updated row to primary. This preserves day-one behavior
--    (most-recent wins) while making it explicit and switchable.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY external_channel_id
           ORDER BY updated_at DESC
         ) AS rn
    FROM assistant_channels
   WHERE channel_type = 'telegram'
     AND is_active = true
     AND external_channel_id IS NOT NULL
)
UPDATE assistant_channels c
   SET is_primary = (r.rn = 1)
  FROM ranked r
 WHERE c.id = r.id;

-- 5. Atomic primary swap RPC.
--    Demotes every active telegram row for the chat, then promotes the target.
--    The partial unique index guarantees at most one primary at any instant;
--    doing both writes in a single function gives us transactional safety
--    without requiring the JS client to manage transactions.
CREATE OR REPLACE FUNCTION set_telegram_chat_primary(
  p_chat_id TEXT,
  p_assistant_id UUID
)
RETURNS TABLE(channel_id UUID, assistant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the target row exists and is active for this chat
  IF NOT EXISTS (
    SELECT 1 FROM assistant_channels
     WHERE channel_type = 'telegram'
       AND is_active = true
       AND external_channel_id = p_chat_id
       AND assistant_channels.assistant_id = p_assistant_id
  ) THEN
    RETURN;
  END IF;

  -- Demote every other primary for this chat first (avoids unique conflict)
  UPDATE assistant_channels
     SET is_primary = false
   WHERE channel_type = 'telegram'
     AND is_active = true
     AND external_channel_id = p_chat_id
     AND is_primary = true
     AND assistant_channels.assistant_id <> p_assistant_id;

  -- Promote the target
  UPDATE assistant_channels
     SET is_primary = true
   WHERE channel_type = 'telegram'
     AND is_active = true
     AND external_channel_id = p_chat_id
     AND assistant_channels.assistant_id = p_assistant_id;

  RETURN QUERY
    SELECT id, assistant_channels.assistant_id
      FROM assistant_channels
     WHERE channel_type = 'telegram'
       AND is_active = true
       AND external_channel_id = p_chat_id
       AND assistant_channels.assistant_id = p_assistant_id
     LIMIT 1;
END;
$$;

COMMENT ON FUNCTION set_telegram_chat_primary IS
  'Atomically makes the given assistant the primary speaker for a Telegram chat. Demotes all other active rows for the same external_channel_id, then promotes the target row. Returns the channel id + assistant id when successful, or empty when the binding does not exist.';
