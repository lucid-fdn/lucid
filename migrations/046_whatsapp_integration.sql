-- ============================================================================
-- Migration 046: WhatsApp Business API Integration
-- ============================================================================
-- Description: Add WhatsApp connection fields to ai_assistants table
-- Author: LucidMerged Team
-- Date: 2026-02-04
-- ============================================================================

-- Add WhatsApp-specific fields to ai_assistants table
ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_webhook_verify_token TEXT;

-- Add comments for documentation
COMMENT ON COLUMN ai_assistants.whatsapp_phone_number_id IS 
  'Meta WhatsApp Phone Number ID (from Business Manager)';
COMMENT ON COLUMN ai_assistants.whatsapp_business_account_id IS 
  'Meta WhatsApp Business Account ID';
COMMENT ON COLUMN ai_assistants.whatsapp_access_token_encrypted IS 
  'Encrypted access token for WhatsApp Cloud API';
COMMENT ON COLUMN ai_assistants.whatsapp_connected IS 
  'Whether WhatsApp is currently connected and active';
COMMENT ON COLUMN ai_assistants.whatsapp_verified_at IS 
  'Timestamp when WhatsApp webhook was verified';
COMMENT ON COLUMN ai_assistants.whatsapp_webhook_verify_token IS 
  'Verification token for webhook validation';

-- Index for efficient webhook lookups
-- Only index connected assistants to optimize webhook routing
CREATE INDEX IF NOT EXISTS idx_assistants_whatsapp_phone 
  ON ai_assistants(whatsapp_phone_number_id) 
  WHERE whatsapp_connected = true;

-- Composite index for channel lookups
CREATE INDEX IF NOT EXISTS idx_assistants_channels
  ON ai_assistants(id, telegram_connected, whatsapp_connected)
  WHERE telegram_connected = true OR whatsapp_connected = true;

-- Grant necessary permissions
GRANT SELECT, UPDATE ON ai_assistants TO service_role;

-- ============================================================================
-- RLS Policies (reuse existing assistant policies)
-- ============================================================================

-- No new RLS policies needed - ai_assistants already has proper RLS
-- Users can only access their own assistants via existing policies

-- ============================================================================
-- Helper function: Get assistant by WhatsApp phone number
-- ============================================================================

CREATE OR REPLACE FUNCTION get_assistant_by_whatsapp_phone(
  p_phone_number_id TEXT
)
RETURNS TABLE (
  assistant_id UUID,
  workspace_id UUID,
  access_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.workspace_id,
    a.whatsapp_access_token_encrypted
  FROM ai_assistants a
  WHERE a.whatsapp_phone_number_id = p_phone_number_id
    AND a.whatsapp_connected = true
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_assistant_by_whatsapp_phone IS 
  'Lookup assistant by WhatsApp phone number ID (for webhook routing)';

GRANT EXECUTE ON FUNCTION get_assistant_by_whatsapp_phone TO service_role;

-- ============================================================================
-- Migration Complete
-- ============================================================================