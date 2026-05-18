-- WhatsApp hosted multi-agent support
--
-- Goals:
-- 1. Keep BYOB invariant: one active WhatsApp phone_number_id per deployment row
-- 2. Allow hosted WhatsApp rows to share the same external chat id
-- 3. Add one-time connect tokens for hosted WhatsApp onboarding

BEGIN;

DROP INDEX IF EXISTS ux_whatsapp_phone_number;

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_phone_number_byob
  ON assistant_channels (external_channel_id)
  WHERE channel_type = 'whatsapp'
    AND connection_mode = 'byob'
    AND is_active = true;

COMMENT ON INDEX ux_whatsapp_phone_number_byob IS
  'Ensures one active BYOB WhatsApp channel per phone_number_id while allowing hosted multi-agent chat bindings.';

CREATE TABLE IF NOT EXISTS assistant_whatsapp_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_whatsapp_link_tokens_token
  ON assistant_whatsapp_link_tokens (token);

CREATE INDEX IF NOT EXISTS idx_assistant_whatsapp_link_tokens_assistant
  ON assistant_whatsapp_link_tokens (assistant_id);

ALTER TABLE assistant_whatsapp_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_whatsapp_link_tokens_service_all ON assistant_whatsapp_link_tokens;
CREATE POLICY assistant_whatsapp_link_tokens_service_all
  ON assistant_whatsapp_link_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
