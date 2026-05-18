-- ============================================
-- EMAIL SYSTEM - MVP
-- ============================================
-- Thin email log + suppression list
-- No Redis, no queue worker - Resend handles delivery

-- Email status enum
CREATE TYPE email_status AS ENUM (
  'queued',      -- Created, about to send
  'sent',        -- Resend accepted it
  'failed',      -- Send failed
  'suppressed'   -- Address is blocked
);

-- Thin email log (NOT a queue)
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Message details
  type TEXT NOT NULL,           -- 'invite' | 'passwordless' | 'receipt' | 'alert' | 'contact' | 'newsletter'
  to_address TEXT NOT NULL,
  subject TEXT,
  
  -- Delivery tracking
  provider_id TEXT,             -- Resend message ID
  status email_status NOT NULL DEFAULT 'queued',
  error TEXT,
  
  -- Idempotency (prevents duplicate sends)
  dedupe_key TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Idempotency via unique index
CREATE UNIQUE INDEX emails_dedupe_key 
ON emails(dedupe_key) 
WHERE dedupe_key IS NOT NULL;

-- Fast lookups
CREATE INDEX emails_status ON emails(status, created_at DESC);
CREATE INDEX emails_provider_id ON emails(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX emails_to_address ON emails(to_address);

-- Suppression list (legal requirement)
CREATE TABLE email_suppressions (
  address TEXT PRIMARY KEY,
  reason TEXT NOT NULL,  -- 'bounce' | 'complaint' | 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments for documentation
COMMENT ON TABLE emails IS 'Email delivery log - tracks all sent emails';
COMMENT ON TABLE email_suppressions IS 'Suppressed email addresses (bounces, complaints, manual blocks)';
COMMENT ON COLUMN emails.dedupe_key IS 'Unique key to prevent duplicate sends (e.g., invite:orgid:email)';
COMMENT ON COLUMN emails.provider_id IS 'External provider message ID (Resend, SES, etc.)';

-- Verification
DO $$
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'EMAIL SYSTEM MIGRATION COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - emails (delivery log)';
    RAISE NOTICE '  - email_suppressions (bounce/complaint list)';
    RAISE NOTICE '==================================================';
END $$;
