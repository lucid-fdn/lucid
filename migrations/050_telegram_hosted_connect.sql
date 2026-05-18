-- ============================================================================
-- Migration 050: Telegram Hosted One-Click Connect
--
-- Enables Option A onboarding flow:
-- - User clicks connect link
-- - Opens hosted Telegram bot
-- - /start token binds chat -> assistant channel
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_telegram_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  telegram_user_id TEXT,
  telegram_chat_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_assistant
  ON assistant_telegram_link_tokens(assistant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_token
  ON assistant_telegram_link_tokens(token);

ALTER TABLE assistant_telegram_link_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view telegram link tokens for their org assistants"
  ON assistant_telegram_link_tokens
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert telegram link tokens for their org assistants"
  ON assistant_telegram_link_tokens
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'member', 'developer')
    )
  );

GRANT SELECT, INSERT, UPDATE ON assistant_telegram_link_tokens TO service_role;
