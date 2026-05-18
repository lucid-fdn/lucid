✅ This is the right direction **and it’s now internally consistent**. The two fixes you called out (schema drift + advisory locks) are the *exact* ones that would have hurt you later.

That said, there are **3 “tighten the screws” items** I’d require before you execute “046v2” and start wiring code.

---

## 1) Don’t put secrets in `channel_config` JSONB (even encrypted)

Your snippet shows:

```json
{
  "access_token": "encrypted..."
}
```

Even if encrypted, putting high-risk secrets inside a general-purpose JSONB field tends to become a footgun:

* harder to enforce “only worker can decrypt”
* easier to accidentally return in debug/admin queries
* muddier RLS / least privilege

✅ **Keep `channel_config` for non-sensitive routing/config only.**
✅ **Put secrets in your existing `encrypted_secrets` mechanism** and reference it from `assistant_channels.encrypted_secrets_id`.

**Recommended split**

* `assistant_channels.external_channel_id` = WhatsApp `phone_number_id` (routing key)
* `assistant_channels.channel_config` JSONB:

  * `business_account_id`
  * `webhook_verify_token_hash` (hash ok)
  * `verified_at`
  * flags like `ack_enabled`, `ack_delay_ms`
* `encrypted_secrets` holds:

  * `access_token`
  * any refresh token / long-lived token material

---

## 2) Migration sequencing: if 046 is already applied, do a true “046v2 / 047”

If you already ran the wrong `046_whatsapp_integration.sql` in prod/staging, don’t “rewrite history”.

✅ Do:

* **047_whatsapp_channel_routing.sql** that:

  * adds needed columns/indexes on `assistant_channels`
  * adds new RPC: `get_channel_by_whatsapp_phone_number_id(phone_number_id)`
  * backfills channel rows from old assistant fields (if they exist)
  * *optionally* keeps old assistant columns for backward compat (deprecated)

This avoids confusion across environments.

---

## 3) Locking: be explicit about the one lock primitive

Your summary says “verify worker uses Phase 4 locks (not ConversationLock)”.

Make it unambiguous:

✅ **Rule:** the worker must **never** use advisory locks in production.
✅ **Only** use `assistant_chat_locks` (or `assistant_conversations.processing_lock_until` style) enforced inside the **claim RPC**.

**Dev TODO**

* Delete/disable `ConversationLock.ts` usage paths (or leave file but unused + clearly marked deprecated).
* Ensure `claim_next_inbound_events()`:

  * acquires lock row for `(channel_id, external_chat_id)`
  * sets `lease_expires_at = now() + 5 min`
  * renew heartbeat extends lease
  * releases lock on success/failure paths

---

# ✅ “Single commit target” (tightened)

Your target is correct; here’s the exact definition I’d hold you to:

### Commit includes

1. **New migration (047)**: channel-based WhatsApp routing + indexes + RPC
2. WhatsAppOutput:

   * TS signatures fixed
   * delivery_state idempotency for ack + final
   * two-layer limiter (global + per-chat)
3. Next.js webhook:

   * GET verify
   * POST ingest
   * DB idempotency (unique index on `(channel_id, external_message_id)`)
4. Locking:

   * claim RPC enforces per-chat serialization using DB locks
   * no advisory lock usage

### “Done” means

All **6 production tests pass**, especially:

* crash after ack
* crash after final
* duplicate webhook payload doesn’t duplicate inbound rows
* per-chat ordering preserved

---

# Quick note on “assistant_channels.channel_config JSONB”

It’s a great place to store:

* routing metadata
* feature flags
* non-secret provider config

It is **not** a good place to store access tokens (even “encrypted...”) when you already have a dedicated encrypted secrets table and a “decrypt only in worker” rule.

---

If you want, paste the actual proposed **046v2/047 SQL** (just the assistant_channels bits + RPC), and I’ll do a fast redline to ensure it matches: **routing key, indexes, RLS implications, and backfill strategy**.
# WhatsApp Integration - CORRECTED Implementation Plan

## ⚠️ Critical Issues Identified by Expert Review

Your dev caught **2 quiet production footguns** that would cause problems at scale:

---

## Issue #1: Schema Drift (CRITICAL)

### Problem
Migration 046 adds WhatsApp fields to `ai_assistants`, but this breaks the channel-based architecture:

```sql
-- WRONG (current Migration 046)
ALTER TABLE ai_assistants
  ADD COLUMN whatsapp_phone_number_id TEXT,
  ADD COLUMN whatsapp_access_token_encrypted TEXT,
  ...
```

**Why this is wrong:**
- Implies "one WhatsApp number per assistant"
- Breaks when you want multiple assistants sharing one managed number
- Routing becomes ambiguous (WhatsApp webhook says "phone X got message", not "assistant Y should answer")

### Correct Architecture

**Channel-based routing:**
```
WhatsApp webhook → phone_number_id → assistant_channels row → channel_id → assistant
```

**Not:**
```
WhatsApp webhook → phone_number_id → ai_assistants row (WRONG)
```

### Solution

**Option A: Clean Migration (Recommended)**

Create new Migration 046v2 that uses `assistant_channels`:

```sql
-- Migration 046v2: WhatsApp via assistant_channels (CORRECT)

-- Add channel-type specific config column
ALTER TABLE assistant_channels
  ADD COLUMN IF NOT EXISTS channel_config JSONB DEFAULT '{}'::jsonb;

-- For WhatsApp channels, channel_config contains:
-- {
--   "phone_number_id": "123...",
--   "business_account_id": "456...",
--   "access_token": "encrypted...",
--   "webhook_verify_token": "...",
--   "verified_at": "2026-02-04T..."
-- }

-- Index for webhook routing
CREATE INDEX IF NOT EXISTS idx_channels_whatsapp
  ON assistant_channels(channel_type, (channel_config->>'phone_number_id'))
  WHERE channel_type = 'whatsapp';

-- Helper function for webhook routing
CREATE OR REPLACE FUNCTION get_channel_by_whatsapp_phone(
  p_phone_number_id TEXT
)
RETURNS TABLE (
  channel_id UUID,
  assistant_id UUID,
  access_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.assistant_id,
    c.channel_config->>'access_token'
  FROM assistant_channels c
  WHERE c.channel_type = 'whatsapp'
    AND c.channel_config->>'phone_number_id' = p_phone_number_id
    AND c.is_active = true
  LIMIT 1;
END;
$$;
```

**Option B: Temporary Compatibility**

Keep current Migration 046 but treat it as legacy:
- Create `assistant_channels` row for each WhatsApp connection
- Use `channel_id` for routing (not `ai_assistants.whatsapp_*`)
- Mark `ai_assistants.whatsapp_*` as deprecated in comments

---

## Issue #2: Advisory Locks Don't Work (CRITICAL)

### Problem

`worker/src/locks/ConversationLock.ts` uses PostgreSQL advisory locks:

```typescript
// WRONG - advisory locks are session-scoped
await conn.query('SELECT pg_advisory_lock($1)', [lockId])
```

**Why this breaks:**
- Supabase uses connection pooling
- Advisory locks are **session-scoped**
- Lock might be released when connection returns to pool
- Different worker might grab same event

### Solution

**Already in Phase 4 plan:**
- Use `assistant_chat_locks` table (row-level locks)
- Atomic `claim_next_inbound_events()` RPC
- DB-backed locking, not advisory

**No code changes needed** - just ensure we're using the Phase 4 locking, not ConversationLock.

---

## Corrected "Do This Next" Order

### A) Fix TypeScript Errors (5-10 minutes)

```typescript
// worker/src/channels/whatsapp/WhatsAppBusinessAPI.ts

// Fix 1: begin() return type
async begin(): Promise<MessageRef | null> {
  // WhatsApp doesn't support editing, so no message ref needed
  await this.sendTypingIndicator()
  return null  // Correct return
}

// Fix 2: finalize() parameter
async finalize(fullText: string): Promise<void> {
  await this.sendMessage(fullText)
}

// Fix 3: Logger signature (check TelegramOutput pattern)
logger.info('[WhatsAppOutput] Streaming started', {
  channelId: this.channelId,
  chatId: this.chatId,
  recipient: this.recipient,
})
```

---

### B) Implement WhatsApp Idempotency (HIGH PRIORITY)

**Problem:** Worker crash mid-send → duplicate ack/final messages

**Solution:** Use `delivery_state` column

```typescript
// In WhatsAppOutput class

async begin(): Promise<MessageRef | null> {
  // Check if we already sent ack (from previous retry)
  const existingAckId = this.event.delivery_state?.whatsapp_ack_message_id
  
  if (existingAckId) {
    // Retry - don't send duplicate ack
    logger.info('[WhatsAppOutput] Reusing existing ack', {
      eventId: this.eventId,
      ackMessageId: existingAckId,
    })
    return null
  }
  
  // First attempt - send ack with 3-second delay (ack-if-slow pattern)
  this.ackTimer = setTimeout(async () => {
    const ackMessage = await this.sendMessage('⏳ Thinking...')
    
    if (ackMessage) {
      // CRITICAL: Persist ack message_id immediately
      await this.persistDeliveryState({
        whatsapp_ack_message_id: ackMessage,
      })
    }
  }, 3000)
  
  return null
}

async finalize(fullText: string): Promise<void> {
  // Cancel ack timer if final comes quickly
  if (this.ackTimer) {
    clearTimeout(this.ackTimer)
  }
  
  // Check if we already sent final (from previous retry)
  const existingFinalId = this.event.delivery_state?.whatsapp_final_message_id
  
  if (existingFinalId) {
    // Retry - already delivered, skip
    logger.info('[WhatsAppOutput] Final already delivered', {
      eventId: this.eventId,
      finalMessageId: existingFinalId,
    })
    return
  }
  
  // Send final message
  const finalMessageId = await this.sendMessage(fullText)
  
  if (finalMessageId) {
    // CRITICAL: Persist final message_id immediately
    await this.persistDeliveryState({
      whatsapp_final_message_id: finalMessageId,
    })
  }
}

// Helper method for atomic delivery_state updates
private async persistDeliveryState(update: Record<string, any>): Promise<void> {
  // Use RPC for atomic JSONB merge (prevents concurrent overwrites)
  await supabase.rpc('update_delivery_state', {
    p_event_id: this.eventId,
    p_updates: update,
  })
}
```

**Add RPC function:**

```sql
-- Atomic delivery_state merge (prevents concurrent key overwrites)
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
```

---

### C) Two-Layer Rate Limiting (HIGH PRIORITY)

**Problem:** No per-chat limiting → can flood single chat

**Solution:** Bottleneck.Group for per-chat limiters

```typescript
// worker/src/rate-limit/RateLimiter.ts

import Bottleneck from 'bottleneck'

// Global limiters (per provider)
const telegramGlobal = new Bottleneck({ minTime: 1000 / 30 }) // 30 req/sec
const whatsappGlobal = new Bottleneck({ minTime: 1000 / 50 }) // 50 req/sec (example)

// Per-chat limiters (prevent flood on single chat)
const telegramPerChat = new Bottleneck.Group({
  maxConcurrent: 1,  // Only 1 message at a time per chat
  minTime: 1000,     // 1 second between messages
})

const whatsappPerChat = new Bottleneck.Group({
  maxConcurrent: 1,
  minTime: 1000,
})

// Two-layer scheduler (global + per-chat)
export function scheduleWhatsApp<T>(
  chatKey: string,
  fn: () => Promise<T>
): Promise<T> {
  return whatsappGlobal.schedule(() =>
    whatsappPerChat.key(chatKey).schedule(fn)
  )
}

export function scheduleTelegram<T>(
  chatKey: string,
  fn: () => Promise<T>
): Promise<T> {
  return telegramGlobal.schedule(() =>
    telegramPerChat.key(chatKey).schedule(fn)
  )
}

// Cleanup (call periodically to prevent memory leaks)
setInterval(() => {
  telegramPerChat.deleteKey = whatsappPerChat.deleteKey = (key) => {
    const limiter = telegramPerChat.key(key)
    if (limiter.counts().QUEUED === 0 && limiter.counts().RUNNING === 0) {
      telegramPerChat.deleteKey(key)
    }
  }
}, 60000) // Every minute
```

**Use in WhatsAppOutput:**

```typescript
private async sendMessage(text: string): Promise<string | null> {
  const chatKey = `${this.channelId}:${this.chatId}`
  
  return scheduleWhatsApp(chatKey, async () => {
    // ... existing send logic ...
    const response = await fetch(`${this.API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })
    // ... rest of logic ...
  })
}
```

---

### D) Webhook Handler with Idempotency

```typescript
// src/app/api/webhooks/whatsapp/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET - Webhook verification (Meta requirement)
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verified')
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// POST - Inbound messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Parse WhatsApp webhook
    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const message = change?.value?.messages?.[0]
    
    if (!message) {
      return NextResponse.json({ status: 'ignored' })
    }
    
    const phoneNumberId = change.value.metadata.phone_number_id
    const from = message.from
    const messageId = message.id
    const text = message.text?.body
    
    // Find channel by phone number
    const { data: channel } = await supabase
      .rpc('get_channel_by_whatsapp_phone', { p_phone_number_id: phoneNumberId })
      .single()
    
    if (!channel) {
      console.warn('[WhatsApp Webhook] No channel found for phone', phoneNumberId)
      return NextResponse.json({ status: 'no_channel' })
    }
    
    // Insert event with idempotency (CRITICAL)
    // Unique index on (channel_id, external_message_id) prevents duplicates
    const { error } = await supabase
      .from('assistant_inbound_events')
      .insert({
        channel_id: channel.channel_id,
        assistant_id: channel.assistant_id,
        external_chat_id: from,
        external_user_id: from,
        external_message_id: messageId,  // CRITICAL for dedup
        message_text: text,
        message_type: 'text',
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
      })
    
    if (error) {
      // Unique constraint violation = already processed (OK)
      if (error.code === '23505') {
        console.log('[WhatsApp Webhook] Duplicate message, skipping', messageId)
        return NextResponse.json({ status: 'duplicate' })
      }
      throw error
    }
    
    return NextResponse.json({ status: 'received' })
    
  } catch (error) {
    console.error('[WhatsApp Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

**Add idempotency index:**

```sql
-- Prevent duplicate webhook processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_unique_msg
  ON assistant_inbound_events(channel_id, external_message_id)
  WHERE external_message_id IS NOT NULL;
```

---

### E) Routing Alignment (MUST DO)

**Decision needed:** Use `assistant_channels` for routing (recommended)

**Update Migration 046:**

```sql
-- Remove WhatsApp fields from ai_assistants
-- Add to assistant_channels.channel_config instead

-- OR keep temporarily but clearly mark as legacy:
COMMENT ON COLUMN ai_assistants.whatsapp_phone_number_id IS 
  'DEPRECATED: Use assistant_channels.channel_config instead. For migration only.';
```

---

### F) Update Documentation

Create `docs/WHATSAPP_ARCHITECTURE.md`:

```markdown
# WhatsApp Architecture

## Routing Flow

1. WhatsApp webhook → phone_number_id
2. Lookup in assistant_channels (channel_type='whatsapp')
3. Get channel_id + assistant_id
4. Insert into assistant_inbound_events
5. Worker processes event

## Channel Config Schema

assistant_channels row for WhatsApp:
- channel_type: 'whatsapp'
- channel_config:
  ```json
  {
    "phone_number_id": "123...",
    "business_account_id": "456...",
    "access_token": "encrypted...",
    "webhook_verify_token": "...",
    "verified_at": "2026-02-04T..."
  }
  ```

## Idempotency

- Webhook: Unique index on (channel_id, external_message_id)
- Delivery: delivery_state tracks ack/final message IDs
```

---

## Production Tests (Must Pass)

### Test 1: Webhook Retry Idempotency
```bash
# Send same webhook payload twice
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d @webhook-payload.json

curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d @webhook-payload.json

# Expected: Only 1 row in assistant_inbound_events
```

### Test 2: Crash After Ack
```bash
# 1. Send message that triggers slow response
# 2. Wait for "⏳ Thinking..." to send
# 3. Kill worker (kill -9 $PID)
# 4. Restart worker
# Expected: No duplicate ack, final message completes
```

### Test 3: Crash After Final
```bash
# 1. Send message
# 2. Wait for final message to send
# 3. Kill worker before event marked complete
# 4. Restart worker
# Expected: No duplicate final message
```

### Test 4: Per-Chat Ordering
```bash
# Send 5 messages quickly from same chat
for i in {1..5}; do
  curl -X POST .../whatsapp -d "{\"text\": \"Message $i\"}" &
done
# Expected: Responses arrive in order (no interleaving)
```

### Test 5: Rate Limit Recovery
```bash
# Mock WhatsApp API to return 429
# Expected: Worker retries with backoff, eventually succeeds
```

### Test 6: Lease Heartbeat
```bash
# Send message that takes >30 seconds (long LLM call)
# Expected: Event stays locked, no duplicate processing
```

---

## Summary of Changes

### Critical Fixes
1. ⚠️ **Schema drift** - Move WhatsApp config to `assistant_channels`
2. ⚠️ **Advisory locks** - Already using Phase 4 DB locks (verify)

### High Priority (Blocking Production)
3. ✅ TypeScript errors (begin/finalize/logger)
4. ✅ Streaming idempotency (delivery_state persistence)
5. ✅ Two-layer rate limiting (Bottleneck.Group)

### Medium Priority
6. ✅ Webhook handler with idempotency
7. ✅ Routing via assistant_channels
8. ✅ Update documentation

### Production Tests
9. ✅ All 6 tests must pass

---

## Next Single Commit Target

**"Complete Phase 4 alignment + webhook + channel routing + idempotency"**

This gets you from "95% connector" to "production-ready without duplication or flood."

**Estimated time: 3-4 hours focused work**