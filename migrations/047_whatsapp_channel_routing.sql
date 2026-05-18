-- ============================================================================
-- Migration 047: WhatsApp Channel-Based Routing (Production-Ready)
-- ============================================================================
-- 
-- Purpose: Enable WhatsApp integration via assistant_channels (correct architecture)
-- Replaces: Migration 046 schema drift (WhatsApp fields on ai_assistants)
-- 
-- Key Decisions:
-- 1. Secrets in encrypted_secrets, NOT in channel_config JSONB
-- 2. external_channel_id for routing (phone_number_id)
-- 3. channel_config for non-sensitive metadata only
-- 4. Backfill from 046 if it was already applied
-- 5. DB-backed locks only (no advisory locks)

-- ----------------------------------------------------------------------------
-- 1) Add channel_config JSONB to assistant_channels (non-sensitive metadata)
-- ----------------------------------------------------------------------------

ALTER TABLE assistant_channels
  ADD COLUMN IF NOT EXISTS channel_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN assistant_channels.channel_config IS 
  'Non-sensitive channel configuration. For WhatsApp: business_account_id, webhook_verify_token_hash, verified_at, ack_enabled, etc. NEVER store access tokens here - use encrypted_secrets instead.';

-- ----------------------------------------------------------------------------
-- 2) Index for WhatsApp webhook routing
-- ----------------------------------------------------------------------------

-- Route by (channel_type, external_channel_id) where external_channel_id = phone_number_id
CREATE INDEX IF NOT EXISTS idx_channels_whatsapp_routing
  ON assistant_channels(channel_type, external_channel_id)
  WHERE channel_type = 'whatsapp' AND is_active = true;

-- ----------------------------------------------------------------------------
-- 3) Helper function for webhook routing
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_channel_by_whatsapp_phone_number_id(
  p_phone_number_id TEXT
)
RETURNS TABLE (
  channel_id UUID,
  assistant_id UUID,
  encrypted_secrets_id UUID,
  channel_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS channel_id,
    c.assistant_id,
    c.encrypted_secrets_id,
    c.channel_config
  FROM assistant_channels c
  WHERE c.channel_type = 'whatsapp'
    AND c.external_channel_id = p_phone_number_id
    AND c.is_active = true
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_channel_by_whatsapp_phone_number_id IS 
  'Routes WhatsApp webhook by phone_number_id → channel. Worker decrypts access token from encrypted_secrets using encrypted_secrets_id.';

-- ----------------------------------------------------------------------------
-- 4) Backfill: Migrate from 046 if ai_assistants.whatsapp_* columns exist
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  -- Check if 046 was applied (whatsapp_phone_number_id column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_assistants' 
    AND column_name = 'whatsapp_phone_number_id'
  ) THEN
    
    -- Backfill assistant_channels from ai_assistants.whatsapp_* fields
    INSERT INTO assistant_channels (
      assistant_id,
      channel_type,
      external_channel_id,
      is_active,
      encrypted_secrets_id,
      channel_config,
      created_at,
      updated_at
    )
    SELECT
      a.id AS assistant_id,
      'whatsapp' AS channel_type,
      a.whatsapp_phone_number_id AS external_channel_id,
      a.whatsapp_connected AS is_active,
      -- Create encrypted_secrets row for access token (handled separately)
      NULL AS encrypted_secrets_id,  -- Will be updated via app code
      jsonb_build_object(
        'business_account_id', a.whatsapp_business_account_id,
        'webhook_verify_token_hash', md5(COALESCE(a.whatsapp_webhook_verify_token, '')),
        'verified_at', a.whatsapp_verified_at,
        'migrated_from_046', true
      ) AS channel_config,
      a.created_at,
      NOW() AS updated_at
    FROM ai_assistants a
    WHERE a.whatsapp_phone_number_id IS NOT NULL
      AND a.whatsapp_connected = true
    ON CONFLICT DO NOTHING;  -- Skip if channel already exists
    
    -- Mark old columns as deprecated
    COMMENT ON COLUMN ai_assistants.whatsapp_phone_number_id IS 
      'DEPRECATED (Migration 046). Use assistant_channels.external_channel_id instead. Kept for backward compatibility only.';
    
    COMMENT ON COLUMN ai_assistants.whatsapp_access_token_encrypted IS 
      'DEPRECATED (Migration 046). Use encrypted_secrets table via assistant_channels.encrypted_secrets_id instead.';
    
    RAISE NOTICE 'Backfilled WhatsApp channels from ai_assistants (Migration 046 detected)';
  ELSE
    RAISE NOTICE 'Migration 046 not detected - skipping backfill';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) Webhook idempotency index (prevent duplicate processing)
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_events_unique_msg
  ON assistant_inbound_events(channel_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

COMMENT ON INDEX idx_inbound_events_unique_msg IS 
  'Prevents duplicate webhook processing. WhatsApp sends same message multiple times on retry.';

-- ----------------------------------------------------------------------------
-- 6) DB-backed chat locking (Phase 4 requirement)
-- ----------------------------------------------------------------------------

-- assistant_chat_locks table (already in 045 or 046, ensure it exists)
CREATE TABLE IF NOT EXISTS assistant_chat_locks (
  channel_id UUID NOT NULL,
  external_chat_id TEXT NOT NULL,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,  -- Worker ID or process ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, external_chat_id)
);

COMMENT ON TABLE assistant_chat_locks IS 
  'DB-backed per-chat locks. Prevents race conditions. Uses row-level locking, NOT advisory locks (advisory locks are session-scoped and unsafe with connection pooling).';

-- Index for lock expiration cleanup
CREATE INDEX IF NOT EXISTS idx_chat_locks_expiration
  ON assistant_chat_locks(locked_until)
  WHERE locked_until IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7) Updated claim RPC (enforces DB locks, NOT advisory locks)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_next_inbound_events(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10,
  p_lease_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  event_id UUID,
  channel_id UUID,
  assistant_id UUID,
  external_chat_id TEXT,
  message_text TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_lease_expires_at TIMESTAMPTZ;
BEGIN
  v_lease_expires_at := NOW() + (p_lease_minutes || ' minutes')::INTERVAL;
  
  RETURN QUERY
  WITH available_events AS (
    -- Find events that are pending and not locked
    SELECT DISTINCT ON (e.channel_id, e.external_chat_id)
      e.id,
      e.channel_id,
      e.assistant_id,
      e.external_chat_id,
      e.message_text
    FROM assistant_inbound_events e
    LEFT JOIN assistant_chat_locks l 
      ON l.channel_id = e.channel_id 
      AND l.external_chat_id = e.external_chat_id
    WHERE e.status = 'pending'
      AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= NOW())
      AND (l.locked_until IS NULL OR l.locked_until < NOW())  -- Not locked or lock expired
    ORDER BY e.channel_id, e.external_chat_id, e.created_at ASC
    LIMIT p_batch_size
  ),
  claimed AS (
    -- Atomically claim events and acquire chat locks
    UPDATE assistant_inbound_events e
    SET 
      status = 'processing',
      lease_expires_at = v_lease_expires_at,
      updated_at = NOW()
    FROM available_events ae
    WHERE e.id = ae.id
    RETURNING e.id, e.channel_id, e.assistant_id, e.external_chat_id, e.message_text
  ),
  locks AS (
    -- Insert or update chat locks
    INSERT INTO assistant_chat_locks (channel_id, external_chat_id, locked_until, locked_by)
    SELECT c.channel_id, c.external_chat_id, v_lease_expires_at, p_worker_id
    FROM claimed c
    ON CONFLICT (channel_id, external_chat_id) 
    DO UPDATE SET
      locked_until = EXCLUDED.locked_until,
      locked_by = EXCLUDED.locked_by,
      updated_at = NOW()
  )
  SELECT 
    c.id AS event_id,
    c.channel_id,
    c.assistant_id,
    c.external_chat_id,
    c.message_text
  FROM claimed c;
END;
$$;

COMMENT ON FUNCTION claim_next_inbound_events IS 
  'Atomically claims events and acquires per-chat locks using DB rows (NOT advisory locks). Ensures at most 1 worker processes each chat at a time. Uses 5-minute lease with heartbeat renewal.';

-- ----------------------------------------------------------------------------
-- 8) Lease renewal (heartbeat)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION renew_event_lease(
  p_event_id UUID,
  p_worker_id TEXT,
  p_lease_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_lease_expires_at TIMESTAMPTZ;
  v_channel_id UUID;
  v_external_chat_id TEXT;
BEGIN
  v_lease_expires_at := NOW() + (p_lease_minutes || ' minutes')::INTERVAL;
  
  -- Update event lease
  UPDATE assistant_inbound_events
  SET lease_expires_at = v_lease_expires_at
  WHERE id = p_event_id
    AND status = 'processing'
  RETURNING channel_id, external_chat_id INTO v_channel_id, v_external_chat_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Extend chat lock
  UPDATE assistant_chat_locks
  SET 
    locked_until = v_lease_expires_at,
    locked_by = p_worker_id,
    updated_at = NOW()
  WHERE channel_id = v_channel_id
    AND external_chat_id = v_external_chat_id;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION renew_event_lease IS 
  'Extends lease for active event + chat lock. Call every 20 seconds to prevent premature timeout during long LLM calls.';

-- ----------------------------------------------------------------------------
-- 9) Lock release (on completion or failure)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION release_chat_lock(
  p_channel_id UUID,
  p_external_chat_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM assistant_chat_locks
  WHERE channel_id = p_channel_id
    AND external_chat_id = p_external_chat_id;
END;
$$;

COMMENT ON FUNCTION release_chat_lock IS 
  'Releases per-chat lock after event processing completes (success or failure).';

-- ----------------------------------------------------------------------------
-- 10) Atomic delivery_state updates (idempotency helper)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_delivery_state(
  p_event_id UUID,
  p_updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE assistant_inbound_events
  SET delivery_state = COALESCE(delivery_state, '{}'::jsonb) || p_updates
  WHERE id = p_event_id;
END;
$$;

COMMENT ON FUNCTION update_delivery_state IS 
  'Atomically merges updates into delivery_state JSONB. Prevents concurrent overwrites when storing ack_message_id and final_message_id for idempotency.';

-- ----------------------------------------------------------------------------
-- Summary & Usage Notes
-- ----------------------------------------------------------------------------

-- Usage example (webhook → worker flow):
-- 
-- 1. WhatsApp webhook arrives at Next.js API route
-- 2. GET /api/webhooks/whatsapp?hub.verify_token=... → verify
-- 3. POST /api/webhooks/whatsapp → parse message
-- 4. Call get_channel_by_whatsapp_phone_number_id(phone_number_id)
-- 5. Insert into assistant_inbound_events (idempotent via unique index)
-- 6. Worker calls claim_next_inbound_events() → acquires DB lock
-- 7. Worker processes event, renews lease every 20s
-- 8. Worker completes → releases lock via release_chat_lock()
-- 
-- Secrets handling:
-- - WhatsApp access token stored in encrypted_secrets table
-- - Worker decrypts using encrypted_secrets_id from channel
-- - channel_config contains ONLY non-sensitive metadata
-- 
-- Locking:
-- - DB-backed locks via assistant_chat_locks table
-- - NO advisory locks (unsafe with connection pooling)
-- - Per-chat serialization prevents race conditions
-- - 5-minute lease with heartbeat renewal
-- 
-- Idempotency:
-- - Webhook: Unique index on (channel_id, external_message_id)
-- - Delivery: delivery_state tracks ack_message_id + final_message_id
-- - Use update_delivery_state() for atomic JSONB updates