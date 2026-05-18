# Migration 047 - Dev Review Sections

Your dev requested these 6 sections for precise redline review:

---

## 1. `assistant_chat_locks` DDL

```sql
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
```

---

## 2. `claim_next_inbound_events()` function body

```sql
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
    -- Find chats where lock is expired or doesn't exist
    SELECT DISTINCT ON (e.channel_id, e.external_chat_id)
      e.channel_id,
      e.external_chat_id
    FROM assistant_inbound_events e
    LEFT JOIN assistant_chat_locks l 
      ON l.channel_id = e.channel_id 
      AND l.external_chat_id = e.external_chat_id
    WHERE e.status = 'pending'
      AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= NOW())
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
      e.message_text
    FROM assistant_inbound_events e
    INNER JOIN acquired_locks al
      ON al.channel_id = e.channel_id
      AND al.external_chat_id = e.external_chat_id
    WHERE e.status = 'pending'
      AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= NOW())
    ORDER BY e.channel_id, e.external_chat_id, e.created_at ASC
  ),
  claimed AS (
    -- Claim events (now that locks are acquired)
    UPDATE assistant_inbound_events e
    SET 
      status = 'processing',
      lease_expires_at = v_lease_expires_at,
      updated_at = NOW()
    FROM available_events ae
    WHERE e.id = ae.id
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
  'Atomically claims events and acquires per-chat locks using DB rows (NOT advisory locks). Lock acquisition is conditional: only succeeds if lock expired or same worker. Prevents race conditions under concurrency. Uses 5-minute lease with heartbeat renewal.';
```

---

## 3. Webhook dedupe index definition

```sql
-- UNIQUE partial index: guards against NULL and non-message events
-- WhatsApp Cloud API sends status updates without message IDs
CREATE UNIQUE INDEX IF NOT EXISTS ux_inbound_webhook_dedupe
  ON assistant_inbound_events (channel_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

COMMENT ON INDEX ux_inbound_webhook_dedupe IS 
  'Prevents duplicate webhook processing. Partial index excludes NULL external_message_id (status updates, etc.). Webhook insert must use ON CONFLICT DO NOTHING.';
```

---

## 4. WhatsApp routing index/constraint definitions

```sql
-- Ensure external_channel_id is NOT NULL for WhatsApp channels
ALTER TABLE assistant_channels
  ADD CONSTRAINT whatsapp_external_channel_id_required
  CHECK (channel_type != 'whatsapp' OR external_channel_id IS NOT NULL);

-- UNIQUE partial index: one phone_number_id = one WhatsApp channel
-- Prevents nondeterministic webhook routing if duplicate channels created
CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_phone_number
  ON assistant_channels (external_channel_id)
  WHERE channel_type = 'whatsapp';

COMMENT ON INDEX ux_whatsapp_phone_number IS 
  'Ensures one phone_number_id maps to exactly one WhatsApp channel. Prevents nondeterministic webhook routing.';
```

---

## 5. Backfill block (IF EXISTS part)

```sql
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
      jsonb_build_object(
        'business_account_id', a.whatsapp_business_account_id,
        'webhook_verify_token_hash', md5(COALESCE(a.whatsapp_webhook_verify_token, '')),
        'verified_at', NULL,  -- Clear until revalidated
        'migrated_from_046', true,
        'needs_secret_rekey', true  -- Force re-entry via UI
      ) AS channel_config,
      a.created_at,
      NOW() AS updated_at
    FROM ai_assistants a
    WHERE a.whatsapp_phone_number_id IS NOT NULL
    ON CONFLICT DO NOTHING;  -- Skip if channel already exists
    
    -- Mark old columns as deprecated
    COMMENT ON COLUMN ai_assistants.whatsapp_phone_number_id IS 
      'DEPRECATED (Migration 046). Use assistant_channels.external_channel_id instead. Kept for backward compatibility only.';
    
    COMMENT ON COLUMN ai_assistants.whatsapp_access_token_encrypted IS 
      'DEPRECATED (Migration 046). Use encrypted_secrets table via assistant_channels.encrypted_secrets_id instead. Re-entry required via UI.';
    
    RAISE NOTICE 'Backfilled WhatsApp channels from ai_assistants (Migration 046 detected). Channels marked for secret re-entry.';
  ELSE
    RAISE NOTICE 'Migration 046 not detected - skipping backfill';
  END IF;
END;
$$;
```

---

## 6. `update_delivery_state()` function body

```sql
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
            (delivery_state->>'whatsapp_ack_message_id')::text,
            (p_updates->>'whatsapp_ack_message_id')::text
          ),
        'whatsapp_final_message_id',
          COALESCE(
            (delivery_state->>'whatsapp_final_message_id')::text,
            (p_updates->>'whatsapp_final_message_id')::text
          )
      )
    )
  WHERE id = p_event_id;
END;
$$;

COMMENT ON FUNCTION update_delivery_state IS 
  'Atomically merges updates into delivery_state JSONB. NEVER overwrites existing message IDs (prevents double-send under retries). Uses COALESCE to preserve first-set value.';
```

---

## Summary of 6 Fixes Applied

| # | Fix | Status |
|---|-----|--------|
| 1 | UNIQUE + partial index for WhatsApp routing | ✅ Applied |
| 2 | Webhook idempotency guards against NULL | ✅ Applied |
| 3 | Backfill handles secrets correctly | ✅ Applied |
| 4 | Chat locks conditional acquisition | ✅ Applied |
| 5 | RPC security (SECURITY DEFINER + search_path) | ✅ Applied |
| 6 | Delivery idempotency protects existing IDs | ✅ Applied |

## Key Changes vs. Original

### Fix #1: Routing (prevents duplicate phone_number_id)
- **Added:** CHECK constraint (external_channel_id NOT NULL for WhatsApp)
- **Added:** UNIQUE INDEX ux_whatsapp_phone_number (partial WHERE channel_type = 'whatsapp')

### Fix #2: Webhook Dedup (handles NULL gracefully)
- **Changed:** Renamed from `idx_inbound_events_unique_msg` to `ux_inbound_webhook_dedupe`
- **Kept:** Partial WHERE clause (external_message_id IS NOT NULL)

### Fix #3: Backfill (can't migrate secrets)
- **Changed:** `is_active = false` (was `true`)
- **Changed:** `verified_at = NULL` (was preserved)
- **Added:** `needs_secret_rekey = true` flag

### Fix #4: Lock Acquisition (conditional, non-blocking)
- **Changed:** Acquire locks FIRST (before claiming events)
- **Added:** WHERE clause on UPDATE: `locked_until < NOW() OR locked_by = same worker`
- **Changed:** INNER JOIN on acquired_locks (only claim if lock succeeded)

### Fix #5: RPC Security (all functions)
- **Added:** `SECURITY DEFINER` to all 5 RPC functions
- **Added:** `SET search_path = public, extensions` to all 5 RPC functions

### Fix #6: Delivery Idempotency (never overwrite)
- **Changed:** Uses nested COALESCE to preserve existing values
- **Added:** `jsonb_strip_nulls` wrapper
- **Logic:** Existing message_id > new message_id (preserves first-set)

---

## Ready for Final Redline

**File:** `migrations/047_whatsapp_channel_routing_FIXED.sql` (549 lines)

**All 6 critical fixes applied. Awaiting dev approval.**