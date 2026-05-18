-- ============================================================================
-- Telegram Multi-Agent Deep Link — Security Hardening
--
-- Follow-up to 20260407100000_telegram_multi_agent.sql addressing two issues
-- surfaced in post-implementation review:
--
--   P0: set_telegram_chat_primary was SECURITY DEFINER with default PUBLIC
--       EXECUTE — any authenticated PostgREST client could swap primaries
--       on arbitrary chats cross-org. Lock EXECUTE to service_role only.
--
--   P1: The share-enabled re-check in bindAgentToChatViaShare was non-atomic
--       — a concurrent flip of telegram_share_enabled during the bind left
--       a window where the newly-promoted primary could receive messages
--       even though sharing had been disabled. Push the share check INSIDE
--       the RPC so the promote is transactional with the flag read.
-- ============================================================================

-- Drop the old signature so we can add the p_require_share_enabled parameter
DROP FUNCTION IF EXISTS set_telegram_chat_primary(TEXT, UUID);

CREATE FUNCTION set_telegram_chat_primary(
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
  -- Verify the target row exists and is active for this chat. When the caller
  -- is doing a deep-link bind (p_require_share_enabled = true), also verify
  -- telegram_share_enabled is still true at promote time — this closes the
  -- race window between the JS pre-check and the RPC call.
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
  'Atomically makes the given assistant the primary speaker for a Telegram chat. Demotes all other active rows for the same external_channel_id, then promotes the target row. When p_require_share_enabled=true, also verifies ai_assistants.telegram_share_enabled=true at promote time (closes the deep-link bind race). Returns the channel id + assistant id when successful, or empty when the binding does not exist / share flag is off.';

-- Lock EXECUTE down to service_role only. The function is called exclusively
-- from server-side code with the service key; no user-facing PostgREST client
-- should be able to invoke it directly.
REVOKE EXECUTE ON FUNCTION set_telegram_chat_primary(TEXT, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_telegram_chat_primary(TEXT, UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION set_telegram_chat_primary(TEXT, UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_telegram_chat_primary(TEXT, UUID, BOOLEAN) TO service_role;
