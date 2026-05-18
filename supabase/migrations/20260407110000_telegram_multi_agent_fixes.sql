-- ============================================================================
-- Telegram Multi-Agent — security & race fixes
--
-- Follow-up to 20260407100000_telegram_multi_agent.sql. Addresses Codex review:
--   P0-1  hosted upsert clobbers BYOB Telegram rows
--   P0-2  primary-swap race silently reported as success
--   P1-3  webhook replay across switch dual-delivers a Telegram update
-- ============================================================================

-- 1. Hosted-vs-BYOB discriminator: ensure at most one hosted row per assistant.
--    Hosted rows are identified by channel_config->>'hosted' = 'true'.
--    BYOB rows do not set this marker — they coexist independently.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_channels_hosted_per_assistant
  ON assistant_channels (assistant_id)
  WHERE channel_type = 'telegram'
    AND is_active = true
    AND (channel_config->>'hosted') = 'true';

-- 2. Replay-dedup index for hosted Telegram webhook.
--    The default insert dedupe is (channel_id, external_message_id), which is
--    insufficient when the chat's primary swaps between Telegram retries — the
--    same update_id ends up under a different channel_id and bypasses dedup.
--    A pre-insert lookup keyed on (external_chat_id, external_message_id) on
--    telegram channels closes the gap. Index makes that lookup O(log n).
CREATE INDEX IF NOT EXISTS idx_inbound_events_telegram_replay
  ON assistant_inbound_events (external_chat_id, external_message_id)
  WHERE external_chat_id IS NOT NULL;

-- 3. Atomic primary swap: take a transaction-scoped advisory lock keyed on the
--    chat id so concurrent /start agent_<uuid> for the same chat are serialized.
--    Without this, two writers can both pass the EXISTS check, both try to
--    promote, and one loses on the partial unique index — but the JS wrapper
--    swallows that into ok:false while the caller never reads the result.
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
  -- Serialize concurrent swaps for the same chat. Released at txn end.
  PERFORM pg_advisory_xact_lock(hashtext('telegram:primary:' || p_chat_id));

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

-- 4. Tenant boundary: this RPC is SECURITY DEFINER and has no in-function auth
--    guard. Callers (Telegram webhook, /switch handler) always run with the
--    service_role key from src/lib/db. REVOKE execution from every client-facing
--    role so an authenticated user cannot call it directly with an arbitrary
--    chat_id/assistant_id and flip the primary for someone else's Telegram chat.
--    service_role bypasses REVOKE, so server paths keep working.
REVOKE ALL ON FUNCTION set_telegram_chat_primary(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_telegram_chat_primary(TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION set_telegram_chat_primary(TEXT, UUID) FROM authenticated;
