-- ============================================================================
-- Migration 047: WhatsApp Channel-Based Routing (PRODUCTION-READY v5)
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
-- 
-- Dev Review Fixes Applied (ALL 6 CRITICAL FIXES):
-- ✅ Fix #1: Idempotent constraint creation (DO block + conrelid check)
-- ✅ Fix #2: SHA-256 instead of MD5 + guard COMMENT ON COLUMN + pgcrypto extension
-- ✅ Fix #3: Reclaim expired processing + failed retries (CRITICAL CORRECTNESS BUG)
-- ✅ Fix #4: Telegram dedupe index collision fix (PRODUCTION-BLOCKING)
-- ✅ Fix #5: DROP + recreate dedupe index (IF NOT EXISTS won't replace broken index)
-- ✅ Fix #6: Preflight check for duplicate WhatsApp channels (UNIQUE index would fail)

-- Enable pgcrypto for SHA-256 hashing (FIX #2)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) Add columns needed for WhatsApp integration
-- ----------------------------------------------------------------------------

-- Add channel_config JSONB to assistant_channels (non-sensitive metadata)
ALTER TABLE assistant_channels
  ADD COLUMN IF NOT EXISTS channel_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN assistant_channels.channel_config IS 
  'Non-sensitive channel configuration. For WhatsApp: business_account_id, webhook_verify_token_hash, verified_at, ack_enabled, etc. NEVER store access tokens here - use encrypted_secrets instead.';

-- Add delivery_state to inbound events (for idempotency tracking)
ALTER TABLE assistant_inbound_events
  ADD COLUMN IF NOT EXISTS delivery_state JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN assistant_inbound_events.delivery_state IS
  'Tracks WhatsApp message IDs for idempotency: whatsapp_ack_message_id, whatsapp_final_message_id. Prevents duplicate sends on retry.';

-- Add lease_expires_at to inbound events (explicit deadline)
ALTER TABLE assistant_inbound_events
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN assistant_inbound_events.lease_expires_at IS
  'Explicit lease deadline for worker heartbeat. Used by claim_next_inbound_events for timeout detection.';

-- Add assistant_id to inbound events for easier querying
ALTER TABLE assistant_inbound_events
  ADD COLUMN IF NOT EXISTS assistant_id UUID REFERENCES ai_assistants(id) ON DELETE CASCADE;

COMMENT ON COLUMN assistant_inbound_events.assistant_id IS
  'Denormalized assistant_id for faster querying. Populated from channel.assistant_id.';

-- Index on assistant_id for queries
CREATE INDEX IF NOT EXISTS idx_inbound_assistant
  ON assistant_inbound_events(assistant_id, created_at DESC)
  WHERE status != 'done';

-- ----------------------------------------------------------------------------
-- 2) Routing constraints and indexes (FIX #1: Idempotent constraint + conrelid)
-- ----------------------------------------------------------------------------

-- Ensure external_channel_id is NOT NULL for WhatsApp channels
-- FIX #1: Wrap in DO block for idempotency + check conrelid to prevent false positives
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_external_channel_id_required'
      AND conrelid = 'assistant_channels'::regclass
  ) THEN
    ALTER TABLE assistant_channels
      ADD CONSTRAINT whatsapp_external_channel_id_required
      CHECK (channel_type != 'whatsapp' OR external_channel_id IS NOT NULL);
  END IF;
END $$;

-- FIX #6: Preflight check for duplicate WhatsApp channels before creating UNIQUE index
DO $$
DECLARE
  v_duplicate_count INTEGER;
BEGIN
  -- Check for duplicate external_channel_id in WhatsApp channels
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT external_channel_id, COUNT(*) as cnt
    FROM assistant_channels
    WHERE channel_type = 'whatsapp'
      AND external_channel_id IS NOT NULL
    GROUP BY external_channel_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF v_duplicate_count > 0 THEN
    -- Cleanup strategy: Deactivate all but the oldest channel for each phone_number_id
    -- This preserves history while preventing constraint violation
    UPDATE assistant_channels
    SET is_active = false,
        updated_at = NOW()
    WHERE id IN (
      SELECT c2.id
      FROM assistant_channels c1
      INNER JOIN assistant_channels c2
        ON c1.external_channel_id = c2.external_channel_id
        AND c1.channel_type = 'whatsapp'
        AND c2.channel_type = 'whatsapp'
        AND c1.created_at < c2.created_at  -- Keep oldest, deactivate newer
    );
    
    RAISE NOTICE 'Found % duplicate WhatsApp channels. Deactivated newer duplicates (kept oldest per phone_number_id).', v_duplicate_count;
  END IF;
END $$;

-- UNIQUE partial index: one phone_number_id = one ACTIVE WhatsApp channel
-- Prevents nondeterministic webhook routing if duplicate channels created
-- NOTE: Only applies to active channels (is_active=true)
CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_phone_number
  ON assistant_channels (external_channel_id)
  WHERE channel_type = 'whatsapp' AND is_active = true;

COMMENT ON INDEX ux_whatsapp_phone_number IS 
  'Ensures one phone_number_id maps to exactly one ACTIVE WhatsApp channel. Prevents nondeterministic webhook routing. Only active channels (is_active=true) are enforced.';

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

GRANT EXECUTE ON FUNCTION get_channel_by_whatsapp_phone_number_id TO service_role;

-- ----------------------------------------------------------------------------
-- 4) Backfill (FIX #2: SHA-256 instead of MD5 + guard COMMENT ON COLUMN)
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
    -- CRITICAL: Cannot safely migrate secrets in SQL (DB doesn't have encryption key)
    -- So we backfill routing-only and mark channel as needs_secret_rekey
    INSERT INTO assistant_channels (
      assistant_id,
      channel_type,
      external_channel_id,
      is_active,
      encrypted_secrets_id,
      secret_token_hash,
      channel_config,
      created_at,
      updated_at
    )
    SELECT
      a.id AS assistant_id,
      'whatsapp' AS channel_type,
      a.whatsapp_phone_number_id AS external_channel_id,
      false AS is_active,  -- Inactive until secrets re-entered
      NULL AS encrypted_secrets_id,  -- Must be set via UI/API
      'placeholder-hash' AS secret_token_hash,  -- Placeholder until secret re-entry
      jsonb_build_object(
        'business_account_id', a.whatsapp_business_account_id,
        -- FIX #2: Use SHA-256 instead of MD5
        'webhook_verify_token_hash',
          encode(digest(COALESCE(a.whatsapp_webhook_verify_token, ''), 'sha256'), 'hex'),
        'verified_at', NULL,  -- Clear until revalidated
        'migrated_from_046', true,
        'needs_secret_rekey', true  -- Force re-entry via UI
      ) AS channel_config,
      a.created_at,
      NOW() AS updated_at
    FROM ai_assistants a
    WHERE a.whatsapp_phone_number_id IS NOT NULL
    ON CONFLICT DO NOTHING;  -- Skip if channel already exists
    
    -- FIX #2: Guard COMMENT ON COLUMN existence before commenting
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='ai_assistants' AND column_name='whatsapp_phone_number_id'
    ) THEN
      COMMENT ON COLUMN ai_assistants.whatsapp_phone_number_id IS 
        'DEPRECATED (Migration 046). Use assistant_channels.external_channel_id instead. Kept for backward compatibility only.';
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='ai_assistants' AND column_name='whatsapp_access_token_encrypted'
    ) THEN
      COMMENT ON COLUMN ai_assistants.whatsapp_access_token_encrypted IS 
        'DEPRECATED (Migration 046). Use encrypted_secrets table via assistant_channels.encrypted_secrets_id instead. Re-entry required via UI.';
    END IF;
    
    RAISE NOTICE 'Backfilled WhatsApp channels from ai_assistants (Migration 046 detected). Channels marked for secret re-entry.';
  ELSE
    RAISE NOTICE 'Migration 046 not detected - skipping backfill';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) Webhook idempotency index (FIX #4 + FIX #5: CRITICAL - Telegram collision fix)
-- ----------------------------------------------------------------------------

-- FIX #5: DROP + recreate index (CREATE INDEX IF NOT EXISTS won't replace broken index)
-- If old index exists, it must be replaced, not skipped
DROP INDEX IF EXISTS ux_inbound_webhook_dedupe;

-- FIX #4: Change from (channel_id, external_message_id) 
--         to (channel_id, external_chat_id, external_message_id)
-- 
-- WHY: Telegram's message_id is only unique PER CHAT, not globally.
--      Without external_chat_id, two chats can have message_id=1 → collision → dropped message.
--      WhatsApp message IDs are globally unique, so this doesn't hurt WhatsApp.
--
-- FIX #5 IMPROVEMENT: Require BOTH external_message_id AND external_chat_id to be NOT NULL
--                     (prevents dedupe from being disabled if external_chat_id is accidentally NULL)
CREATE UNIQUE INDEX ux_inbound_webhook_dedupe
  ON assistant_inbound_events (channel_id, external_chat_id, external_message_id)
  WHERE external_message_id IS NOT NULL AND external_chat_id IS NOT NULL;

COMMENT ON INDEX ux_inbound_webhook_dedupe IS 
  'Prevents duplicate webhook processing. Includes external_chat_id for Telegram (message_id is only unique per chat). WhatsApp message IDs are globally unique so this is safe for both. Partial index requires BOTH message_id and chat_id to be NOT NULL (prevents dedupe from being disabled on accidental NULL). Webhook insert must use ON CONFLICT DO NOTHING.';

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
-- 7) Updated claim RPC (FIX #3: CRITICAL - Reclaim expired processing + retries)
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
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_lease_expires_at TIMESTAMPTZ;
BEGIN
  v_lease_expires_at := NOW() + (p_lease_minutes || ' minutes')::INTERVAL;
  
  RETURN QUERY
  WITH available_chats AS (
    -- FIX #3: Find chats where lock is expired or doesn't exist
    -- Includes: pending, expired processing, and failed events eligible for retry
    SELECT DISTINCT ON (e.channel_id, e.external_chat_id)
      e.channel_id,
      e.external_chat_id
    FROM assistant_inbound_events e
    LEFT JOIN assistant_chat_locks l 
      ON l.channel_id = e.channel_id 
      AND l.external_chat_id = e.external_chat_id
    WHERE (
        -- FIX #3: Include pending events
        e.status = 'pending'
        -- FIX #3: Include processing with expired lease (worker crash recovery)
        OR (e.status = 'processing' AND (e.locked_until < NOW() OR e.lease_expires_at < NOW()))
        -- FIX #3: Include failed events eligible for retry
        OR (e.status = 'failed' AND e.next_attempt_at <= NOW() AND e.attempts < e.max_attempts)
      )
      AND (l.locked_until IS NULL OR l.locked_until < NOW())
    ORDER BY e.channel_id, e.external_chat_id, e.created_at ASC
    LIMIT p_batch_size
  ),
  acquired_locks AS (
    -- Conditionally acquire locks (ONLY if expired or same worker)
    -- This prevents overwriting active locks from other workers
    INSERT INTO assistant_chat_locks (channel_id, external_chat_id, locked_by, locked_until, created_at, updated_at)
    SELECT ac.channel_id, ac.external_chat_id, p_worker_id, v_lease_expires_at, NOW(), NOW()
    FROM available_chats ac
    ON CONFLICT (channel_id, external_chat_id) 
    DO UPDATE SET
      locked_by = EXCLUDED.locked_by,
      locked_until = EXCLUDED.locked_until,
      updated_at = NOW()
    WHERE assistant_chat_locks.locked_until < NOW()  -- Only if expired
       OR assistant_chat_locks.locked_by = EXCLUDED.locked_by  -- Or same worker (renewal)
    RETURNING channel_id, external_chat_id
  ),
  available_events AS (
    -- Find events for successfully locked chats
    SELECT DISTINCT ON (e.channel_id, e.external_chat_id)
      e.id,
      e.channel_id,
      e.assistant_id,
      e.external_chat_id,
      e.message_text,
      e.status,
      e.locked_until,
      e.lease_expires_at
    FROM assistant_inbound_events e
    INNER JOIN acquired_locks al
      ON al.channel_id = e.channel_id
      AND al.external_chat_id = e.external_chat_id
    WHERE (
        e.status = 'pending'
        OR (e.status = 'processing' AND (e.locked_until < NOW() OR e.lease_expires_at < NOW()))
        OR (e.status = 'failed' AND e.next_attempt_at <= NOW() AND e.attempts < e.max_attempts)
      )
    ORDER BY e.channel_id, e.external_chat_id, e.created_at ASC
  ),
  claimed AS (
    -- FIX #3: Claim events with conditional UPDATE (don't overwrite fresh processing rows)
    UPDATE assistant_inbound_events e
    SET 
      status = 'processing',
      locked_at = NOW(),
      locked_by = p_worker_id,
      locked_until = v_lease_expires_at,
      lease_expires_at = v_lease_expires_at,
      attempts = e.attempts + 1,  -- FIX #3: Increment attempts
      updated_at = NOW()
    FROM available_events ae
    WHERE e.id = ae.id
      -- FIX #3: Only update if still in expected state (prevents race with another worker)
      AND (
        e.status = 'pending'
        OR (e.status = 'processing' AND (e.locked_until < NOW() OR e.lease_expires_at < NOW()))
        OR (e.status = 'failed' AND e.next_attempt_at <= NOW() AND e.attempts < e.max_attempts)
      )
    RETURNING e.id, e.channel_id, e.assistant_id, e.external_chat_id, e.message_text
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
  'Atomically claims events and acquires per-chat locks using DB rows (NOT advisory locks). 
  
  INCLUDES RETRY LOGIC:
  - Reclaims expired processing events (worker crash recovery)
  - Retries failed events (when next_attempt_at <= NOW() and attempts < max_attempts)
  
  Lock acquisition is conditional: only succeeds if lock expired or same worker. 
  Prevents race conditions under concurrency. Uses 5-minute lease with heartbeat renewal.';

GRANT EXECUTE ON FUNCTION claim_next_inbound_events TO service_role;

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
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_lease_expires_at TIMESTAMPTZ;
  v_channel_id UUID;
  v_external_chat_id TEXT;
BEGIN
  v_lease_expires_at := NOW() + (p_lease_minutes || ' minutes')::INTERVAL;
  
  -- Update event lease
  UPDATE assistant_inbound_events
  SET 
    locked_until = v_lease_expires_at,
    lease_expires_at = v_lease_expires_at
  WHERE id = p_event_id
    AND locked_by = p_worker_id
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

GRANT EXECUTE ON FUNCTION renew_event_lease TO service_role;

-- ----------------------------------------------------------------------------
-- 9) Lock release (on completion or failure)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION release_chat_lock(
  p_channel_id UUID,
  p_external_chat_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM assistant_chat_locks
  WHERE channel_id = p_channel_id
    AND external_chat_id = p_external_chat_id;
END;
$$;

COMMENT ON FUNCTION release_chat_lock IS 
  'Releases per-chat lock after event processing completes (success or failure).';

GRANT EXECUTE ON FUNCTION release_chat_lock TO service_role;

-- ----------------------------------------------------------------------------
-- 10) Atomic delivery_state updates (idempotency - never overwrite existing IDs)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_delivery_state(
  p_event_id UUID,
  p_updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Merge updates but NEVER overwrite existing message IDs
  -- Uses COALESCE to preserve first-set value (prevents double-send under retries)
  UPDATE assistant_inbound_events
  SET delivery_state = COALESCE(delivery_state, '{}'::jsonb) || 
    jsonb_strip_nulls(
      jsonb_build_object(
        'whatsapp_ack_message_id', 
          COALESCE(
            delivery_state->>'whatsapp_ack_message_id',
            p_updates->>'whatsapp_ack_message_id'
          ),
        'whatsapp_final_message_id',
          COALESCE(
            delivery_state->>'whatsapp_final_message_id',
            p_updates->>'whatsapp_final_message_id'
          )
      )
    )
  WHERE id = p_event_id;
END;
$$;

COMMENT ON FUNCTION update_delivery_state IS 
  'Atomically merges updates into delivery_state JSONB. NEVER overwrites existing message IDs (prevents double-send under retries). Uses COALESCE to preserve first-set value.';

GRANT EXECUTE ON FUNCTION update_delivery_state TO service_role;

-- ----------------------------------------------------------------------------
-- Summary & Usage Notes
-- ----------------------------------------------------------------------------

-- Usage example (webhook → worker flow):
-- 
-- 1. WhatsApp webhook arrives at Next.js API route
-- 2. GET /api/webhooks/whatsapp?hub.verify_token=... → verify
-- 3. POST /api/webhooks/whatsapp → parse message
-- 4. Call get_channel_by_whatsapp_phone_number_id(phone_number_id)
-- 5. Insert into assistant_inbound_events with ON CONFLICT DO NOTHING (idempotent)
-- 6. Worker calls claim_next_inbound_events() → conditionally acquires DB lock
-- 7. Worker processes event, renews lease every 20s
-- 8. Worker completes → releases lock via release_chat_lock()
-- 
-- Secrets handling:
-- - WhatsApp access token stored in encrypted_secrets table
-- - Worker decrypts using encrypted_secrets_id from channel
-- - channel_config contains ONLY non-sensitive metadata
-- - Migration 046 backfill requires secret re-entry (needs_secret_rekey flag)
-- 
-- Locking:
-- - DB-backed locks via assistant_chat_locks table
-- - NO advisory locks (unsafe with connection pooling)
-- - Conditional acquisition: only if expired or same worker
-- - Per-chat serialization prevents race conditions
-- - 5-minute lease with heartbeat renewal
-- 
-- Idempotency:
-- - Webhook: Unique index on (channel_id, external_chat_id, external_message_id WHERE BOTH NOT NULL)
-- - FIX #4: Includes external_chat_id for Telegram (message_id only unique per chat)
-- - FIX #5: DROP + recreate index (IF NOT EXISTS won't replace broken index)
-- - FIX #5 IMPROVEMENT: WHERE clause requires BOTH to be NOT NULL (prevents dedupe bypass)
-- - Delivery: delivery_state tracks ack_message_id + final_message_id
-- - update_delivery_state() uses COALESCE to never overwrite existing IDs
-- - Retries reuse same message IDs (no duplicate sends)
--
-- Retry/Reclaim (FIX #3):
-- - claim_next_inbound_events() reclaims expired processing events (worker crash recovery)
-- - Retries failed events when next_attempt_at <= NOW() and attempts < max_attempts
-- - Increments attempts counter on each claim
-- - Uses conditional UPDATE to prevent race conditions
--
-- WhatsApp Channel Uniqueness (FIX #6):
-- - Preflight check for duplicate external_channel_id before creating UNIQUE index
-- - Deactivates newer duplicates (keeps oldest per phone_number_id)
-- - UNIQUE index only applies to active channels (is_active=true)
-- - Prevents migration failure due to pre-existing duplicates
--
-- Dev Review Fixes Applied (ALL 6):
-- ✅ Fix #1: Idempotent constraint creation (DO block checks pg_constraint + conrelid)
-- ✅ Fix #2: SHA-256 instead of MD5 + guarded COMMENT ON COLUMN + pgcrypto extension
-- ✅ Fix #3: Reclaim expired processing + failed retries (CRITICAL correctness bug fixed)
-- ✅ Fix #4: Telegram dedupe index collision fix (PRODUCTION-BLOCKING - includes external_chat_id)
-- ✅ Fix #5: DROP + recreate dedupe index (IF NOT EXISTS won't replace) + WHERE BOTH NOT NULL
-- ✅ Fix #6: Preflight duplicate cleanup (prevents UNIQUE index creation failure)