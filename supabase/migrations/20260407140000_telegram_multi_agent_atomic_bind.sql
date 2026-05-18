-- ============================================================================
-- Telegram Multi-Agent — atomic hosted bind + advisory lock restore
--
-- Follow-up to 20260407130000_telegram_multi_agent_hardening.sql. Addresses
-- two findings from the second Codex review pass:
--
--   P0: upsertHostedTelegramChannel mutated an existing hosted row
--       (external_channel_id rewrite) BEFORE calling the guarded primary
--       swap RPC. If telegram_share_enabled flipped false in that window,
--       the bind returned share_disabled but the row had already moved
--       across chats — and, because the UPDATE did not clear is_primary,
--       the disabled agent could remain primary in the new chat. The JS
--       rollback only touched freshly-inserted rows, not pre-existing
--       moved rows. Fix: move the row update + share check + primary
--       swap into a single SECURITY DEFINER RPC that holds an advisory
--       lock and a FOR UPDATE row lock on the assistant for the whole
--       transaction.
--
--   P1: The previous hardening migration dropped and recreated
--       set_telegram_chat_primary WITHOUT the pg_advisory_xact_lock that
--       was added in 20260407110000_telegram_multi_agent_fixes.sql. That
--       reopened the concurrent-swap race on /switch for the same chat.
--       Fix: re-add the advisory lock at the start of the 3-arg function.
-- ============================================================================

-- 1. Re-add the advisory lock on set_telegram_chat_primary. This is the
--    /switch-path entry point — two owners tapping switch on the same chat
--    at the same time must serialize so neither loses to the partial unique
--    index. The lock is transaction-scoped and released on commit/rollback.
CREATE OR REPLACE FUNCTION set_telegram_chat_primary(
  p_chat_id TEXT,
  p_assistant_id UUID,
  p_require_share_enabled BOOLEAN DEFAULT false
)
RETURNS TABLE(channel_id UUID, assistant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Serialize concurrent swaps for the same chat. Released at txn end.
  PERFORM pg_advisory_xact_lock(hashtext('telegram:primary:' || p_chat_id));

  IF p_require_share_enabled THEN
    IF NOT EXISTS (
      SELECT 1
        FROM assistant_channels c
        JOIN ai_assistants a ON a.id = c.assistant_id
       WHERE c.channel_type = 'telegram'
         AND c.is_active = true
         AND c.external_channel_id = p_chat_id
         AND c.assistant_id = p_assistant_id
         AND a.telegram_share_enabled = true
    ) THEN
      RETURN;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM assistant_channels
       WHERE channel_type = 'telegram'
         AND is_active = true
         AND external_channel_id = p_chat_id
         AND assistant_channels.assistant_id = p_assistant_id
    ) THEN
      RETURN;
    END IF;
  END IF;

  UPDATE assistant_channels
     SET is_primary = false
   WHERE channel_type = 'telegram'
     AND is_active = true
     AND external_channel_id = p_chat_id
     AND is_primary = true
     AND assistant_channels.assistant_id <> p_assistant_id;

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

-- 2. New atomic bind RPC. Collapses the hosted-row upsert, the share-flag
--    check, and the primary swap into a single transaction holding:
--      (a) an advisory lock on the destination chat (prevents concurrent
--          binds on the same chat from interleaving), and
--      (b) a SELECT FOR UPDATE on the assistant row (prevents a concurrent
--          flip of telegram_share_enabled from landing between the check
--          and the write).
--
--    Returns (channel_id, assistant_id) on success, empty on failure
--    (agent missing, share flag off when required, etc). Any partial work
--    performed before the failure check is rolled back via RETURN before
--    commit — the update/insert happens after all guards pass.
CREATE OR REPLACE FUNCTION bind_hosted_telegram_channel(
  p_assistant_id UUID,
  p_chat_id TEXT,
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
  -- Serialize concurrent binds/switches on the same chat
  PERFORM pg_advisory_xact_lock(hashtext('telegram:primary:' || p_chat_id));

  -- Row-lock the assistant so a concurrent flip of telegram_share_enabled
  -- on another connection blocks until we commit/rollback. Prevents the
  -- "flag flipped mid-bind" race where the row got moved but the swap
  -- was then rejected by the RPC.
  SELECT telegram_share_enabled
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
    'telegram_chat_id', p_chat_id,
    'hosted', true
  );

  -- Look for an existing hosted row for this assistant. Only rows flagged
  -- with channel_config->>'hosted' = 'true' qualify — BYOB telegram rows
  -- coexist independently and must never be clobbered.
  SELECT c.id
    INTO v_existing_id
    FROM assistant_channels c
   WHERE c.assistant_id = p_assistant_id
     AND c.channel_type = 'telegram'
     AND c.is_active = true
     AND (c.channel_config->>'hosted') = 'true'
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Reuse the existing hosted row. Clear is_primary because the chat may
    -- have moved — any primary status in the old chat must be dropped
    -- before the swap below re-establishes primary in the new chat.
    UPDATE assistant_channels AS c
       SET is_active = true,
           channel_config = v_channel_config,
           external_channel_id = p_chat_id,
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
      'telegram',
      p_secret_token,
      p_chat_id,
      true,
      false,
      v_channel_config
    )
    RETURNING id INTO v_channel_id;
  END IF;

  -- Demote any other primary row on this chat
  UPDATE assistant_channels AS c
     SET is_primary = false
   WHERE c.channel_type = 'telegram'
     AND c.is_active = true
     AND c.external_channel_id = p_chat_id
     AND c.is_primary = true
     AND c.assistant_id <> p_assistant_id;

  -- Promote the target row (guaranteed unique: partial index on
  -- (external_channel_id) WHERE is_primary = true AND is_active = true
  -- AND channel_type = 'telegram' — serialized by the advisory lock above)
  UPDATE assistant_channels AS c
     SET is_primary = true
   WHERE c.id = v_channel_id;

  RETURN QUERY SELECT v_channel_id, p_assistant_id;
END;
$$;

COMMENT ON FUNCTION bind_hosted_telegram_channel IS
  'Atomically upserts a hosted Telegram channel for (assistant, chat) and promotes it to primary. Holds a chat-scoped advisory lock and a FOR UPDATE lock on the assistant row so a concurrent flip of telegram_share_enabled cannot interleave. Returns (channel_id, assistant_id) on success, empty row on failure (agent missing / share flag off when required).';

REVOKE EXECUTE ON FUNCTION bind_hosted_telegram_channel(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bind_hosted_telegram_channel(UUID, TEXT, TEXT, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION bind_hosted_telegram_channel(UUID, TEXT, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION bind_hosted_telegram_channel(UUID, TEXT, TEXT, BOOLEAN) TO service_role;
