-- ============================================================================
-- Migration 081: Telegram Account Link Tokens
--
-- One-time tokens generated from the web dashboard that link a Telegram user
-- to an existing LucidMerged profile + org. Flow:
--   1. User clicks "Connect Telegram" in dashboard
--   2. API generates token + returns deep link: t.me/BotName?start=link_TOKEN
--   3. User opens Telegram → /start link_TOKEN
--   4. Bot consumes token → links telegram_user_id to profile + org
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS telegram_account_link_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  telegram_user_id TEXT,       -- Filled when consumed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tg_account_link_tokens_token
  ON telegram_account_link_tokens (token);

CREATE INDEX IF NOT EXISTS idx_tg_account_link_tokens_profile
  ON telegram_account_link_tokens (profile_id);

ALTER TABLE telegram_account_link_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create/view tokens for their own profile
CREATE POLICY tg_account_link_tokens_user_select
  ON telegram_account_link_tokens
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY tg_account_link_tokens_user_insert
  ON telegram_account_link_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- Service role can do everything (bot consumes tokens)
CREATE POLICY tg_account_link_tokens_service_all
  ON telegram_account_link_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Helper function: generate a link token (called from API route)
CREATE OR REPLACE FUNCTION create_telegram_link_token(
  p_profile_id UUID,
  p_org_id UUID,
  p_ttl_minutes INTEGER DEFAULT 15
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO telegram_account_link_tokens (
    profile_id, org_id, token, expires_at
  ) VALUES (
    p_profile_id, p_org_id, v_token, NOW() + (p_ttl_minutes || ' minutes')::interval
  );

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION create_telegram_link_token(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION create_telegram_link_token(UUID, UUID, INTEGER) TO service_role;

-- Helper function: consume a link token (called by bot)
CREATE OR REPLACE FUNCTION consume_telegram_link_token(
  p_token TEXT,
  p_telegram_user_id TEXT,
  p_telegram_username TEXT DEFAULT NULL
)
RETURNS TABLE(profile_id UUID, org_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_record telegram_account_link_tokens%ROWTYPE;
BEGIN
  -- Find and lock the token
  SELECT * INTO v_record
  FROM telegram_account_link_tokens
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > NOW()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found, expired, or already used';
  END IF;

  -- Mark as used
  UPDATE telegram_account_link_tokens
  SET used_at = NOW(), telegram_user_id = p_telegram_user_id
  WHERE id = v_record.id;

  -- Upsert telegram_user_links (overwrites any existing link for this telegram user)
  INSERT INTO telegram_user_links (
    telegram_user_id, profile_id, org_id, telegram_username
  ) VALUES (
    p_telegram_user_id, v_record.profile_id, v_record.org_id, p_telegram_username
  )
  ON CONFLICT (telegram_user_id)
  DO UPDATE SET
    profile_id = EXCLUDED.profile_id,
    org_id = EXCLUDED.org_id,
    telegram_username = COALESCE(EXCLUDED.telegram_username, telegram_user_links.telegram_username),
    updated_at = NOW();

  RETURN QUERY SELECT v_record.profile_id, v_record.org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_telegram_link_token(TEXT, TEXT, TEXT) TO service_role;

COMMIT;
