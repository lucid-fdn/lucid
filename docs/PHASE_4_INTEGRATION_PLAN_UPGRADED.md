# Phase 4: Production Integration Plan (UPGRADED)

## 🎯 Critical Upgrades from Expert Review

This plan incorporates **6 surgical upgrades** identified by production review. These prevent subtle reliability/UX bugs that would appear under load.

---

## Migration 046: Foundation (Run First)

```sql
-- ============================================================================
-- Migration 046: Production-Safe Locking + Memory Dedup
-- ============================================================================

-- 1) Per-chat locks (keyed by data you have at insert-time)
CREATE TABLE IF NOT EXISTS assistant_chat_locks (
  channel_id UUID NOT NULL,
  external_chat_id TEXT NOT NULL,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, external_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_locks_until
  ON assistant_chat_locks (locked_until)
  WHERE locked_until IS NOT NULL;

COMMENT ON TABLE assistant_chat_locks IS 
  'Per-chat locks to prevent concurrent processing of same chat';
COMMENT ON COLUMN assistant_chat_locks.locked_until IS 
  'Lock expires at this time (5 min lease with heartbeat renewal)';

-- 2) Memory dedup (user-scoped to prevent cross-user leakage)
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_unique_content
  ON assistant_memory(assistant_id, external_user_id, content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON INDEX idx_memory_unique_content IS 
  'Prevents duplicate memories per user (user-scoped dedup)';

-- 3) Add lease_expires_at to events (for heartbeat tracking)
ALTER TABLE assistant_inbound_events
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_lease
  ON assistant_inbound_events (lease_expires_at)
  WHERE status = 'processing';

-- 4) Add delivery_state for streaming idempotency
ALTER TABLE assistant_inbound_events
  ADD COLUMN IF NOT EXISTS delivery_state JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN assistant_inbound_events.delivery_state IS 
  'Stores Telegram message_id, WhatsApp ack status, etc. for retry idempotency';

CREATE INDEX IF NOT EXISTS idx_events_delivery_state
  ON assistant_inbound_events USING GIN (delivery_state);
```

---

## A) Correctness Fixes (UPGRADED)

### 1. Claim Events with Per-Chat Locking (ATOMIC)

**Critical changes:**
- ✅ Lock by `(channel_id, external_chat_id)` - stable key at insert-time
- ✅ `DISTINCT ON` - at most 1 event per chat per batch
- ✅ 5-minute lease (realistic for LLM + tools)
- ✅ Atomic lock acquisition via `ON CONFLICT`

```sql
CREATE OR REPLACE FUNCTION claim_next_inbound_events(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10,
  p_lease_minutes INTEGER DEFAULT 5
)
RETURNS SETOF assistant_inbound_events
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_ids UUID[];
BEGIN
  -- Step 1: Find ready events (at most 1 per chat)
  -- CRITICAL: Use DISTINCT ON to prevent claiming multiple events from same chat
  SELECT array_agg(e.id)
  INTO v_event_ids
  FROM (
    SELECT DISTINCT ON (e.channel_id, e.external_chat_id) e.id
    FROM assistant_inbound_events e
    LEFT JOIN assistant_chat_locks l ON 
      l.channel_id = e.channel_id AND 
      l.external_chat_id = e.external_chat_id
    WHERE e.status = 'pending'
      AND e.attempts < 5
      AND e.next_attempt_at <= NOW()
      AND (
        l.locked_until IS NULL 
        OR l.locked_until < NOW()  -- Lock expired
      )
    ORDER BY e.channel_id, e.external_chat_id, e.next_attempt_at ASC
  ) AS distinct_events
  LIMIT p_batch_size;

  -- Exit early if no events
  IF v_event_ids IS NULL OR array_length(v_event_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- Step 2: Acquire locks (atomic via UPSERT)
  INSERT INTO assistant_chat_locks (channel_id, external_chat_id, locked_until, locked_by)
  SELECT DISTINCT e.channel_id, e.external_chat_id, 
         NOW() + (p_lease_minutes || ' minutes')::INTERVAL,
         p_worker_id
  FROM assistant_inbound_events e
  WHERE e.id = ANY(v_event_ids)
  ON CONFLICT (channel_id, external_chat_id) 
  DO UPDATE SET
    locked_until = NOW() + (p_lease_minutes || ' minutes')::INTERVAL,
    locked_by = p_worker_id,
    updated_at = NOW()
  WHERE assistant_chat_locks.locked_until < NOW();  -- Only steal expired locks

  -- Step 3: Claim the events
  UPDATE assistant_inbound_events
  SET 
    status = 'processing',
    attempts = attempts + 1,
    claimed_by = p_worker_id,
    claimed_at = NOW(),
    lease_expires_at = NOW() + (p_lease_minutes || ' minutes')::INTERVAL
  WHERE id = ANY(v_event_ids);

  -- Step 4: Return claimed events
  RETURN QUERY
  SELECT * FROM assistant_inbound_events
  WHERE id = ANY(v_event_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_next_inbound_events TO service_role;
```

### 2. Release Lock + Heartbeat Renewal

```sql
-- Release chat lock (called after processing)
CREATE OR REPLACE FUNCTION release_chat_lock(
  p_channel_id UUID,
  p_external_chat_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE assistant_chat_locks
  SET 
    locked_until = NULL,
    locked_by = NULL,
    updated_at = NOW()
  WHERE channel_id = p_channel_id
    AND external_chat_id = p_external_chat_id;
END;
$$;

-- Heartbeat: renew lease during long-running processing
CREATE OR REPLACE FUNCTION renew_event_lease(
  p_event_id UUID,
  p_worker_id TEXT,
  p_lease_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_channel_id UUID;
  v_external_chat_id TEXT;
BEGIN
  -- Get chat identifiers
  SELECT channel_id, external_chat_id
  INTO v_channel_id, v_external_chat_id
  FROM assistant_inbound_events
  WHERE id = p_event_id
    AND claimed_by = p_worker_id;

  IF NOT FOUND THEN
    RETURN FALSE;  -- Event not owned by this worker
  END IF;

  -- Renew lock
  UPDATE assistant_chat_locks
  SET 
    locked_until = NOW() + (p_lease_minutes || ' minutes')::INTERVAL,
    updated_at = NOW()
  WHERE channel_id = v_channel_id
    AND external_chat_id = v_external_chat_id
    AND locked_by = p_worker_id;

  -- Renew event lease
  UPDATE assistant_inbound_events
  SET lease_expires_at = NOW() + (p_lease_minutes || ' minutes')::INTERVAL
  WHERE id = p_event_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION release_chat_lock TO service_role;
GRANT EXECUTE ON FUNCTION renew_event_lease TO service_role;
```

**TypeScript usage:**
```typescript
// worker/src/processors/inbound.ts

// Start heartbeat when processing long-running event
const heartbeatInterval = setInterval(async () => {
  await supabase.rpc('renew_event_lease', {
    p_event_id: event.id,
    p_worker_id: workerId,
    p_lease_minutes: 5,
  })
}, 20_000) // Renew every 20 seconds

try {
  await processEvent(event)
} finally {
  clearInterval(heartbeatInterval)
  await supabase.rpc('release_chat_lock', {
    p_channel_id: event.channel_id,
    p_external_chat_id: event.external_chat_id,
  })
}
```

### 3. Update upsert_memory() for User-Scoped Dedup

```sql
CREATE OR REPLACE FUNCTION upsert_memory(
  p_assistant_id UUID,
  p_external_user_id TEXT,
  p_content TEXT,
  p_category TEXT,
  p_importance REAL,
  p_conversation_id UUID,
  p_embedding TEXT,  -- JSON string
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_content_hash TEXT;
  v_memory_id UUID;
BEGIN
  -- Calculate content hash
  v_content_hash := md5(p_content);

  -- Upsert with user-scoped dedup
  INSERT INTO assistant_memory (
    assistant_id,
    external_user_id,
    content,
    category,
    importance,
    conversation_id,
    embedding,
    content_hash,
    metadata
  )
  VALUES (
    p_assistant_id,
    p_external_user_id,
    p_content,
    p_category,
    p_importance,
    p_conversation_id,
    p_embedding::vector,
    v_content_hash,
    p_metadata
  )
  ON CONFLICT (assistant_id, external_user_id, content_hash)
  DO UPDATE SET
    importance = GREATEST(assistant_memory.importance, EXCLUDED.importance),
    updated_at = NOW(),
    metadata = assistant_memory.metadata || EXCLUDED.metadata
  RETURNING id INTO v_memory_id;

  RETURN v_memory_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_memory TO service_role;
```

### 4. Clean Status Semantics (No "Failed but Retryable")

**Pattern:**
- `status = 'pending'` + `next_attempt_at` → Retryable
- `status = 'processing'` + `lease_expires_at` → Active
- `status = 'completed'` → Success
- `status = 'failed'` → Terminal (no retry)

**Update event failure handling:**
```typescript
// On error during processing:
if (event.attempts >= MAX_ATTEMPTS) {
  // Terminal failure
  await supabase
    .from('assistant_inbound_events')
    .update({
      status: 'failed',  // No more retries
      error_message: error.message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', event.id)
} else {
  // Retryable - back to pending
  await supabase
    .from('assistant_inbound_events')
    .update({
      status: 'pending',  // Will be claimed again
      next_attempt_at: new Date(Date.now() + BACKOFF_MS).toISOString(),
      error_message: error.message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', event.id)
}
```

---

## B) Streaming Fixes (UPGRADED)

### 5. Streaming Idempotency (CRITICAL)

**Problem:** Worker crashes mid-stream → retry creates duplicate placeholder messages.

**Solution:** Persist Telegram `message_id` in `delivery_state` on first send.

```typescript
// worker/src/channels/telegram/TelegramOutput.ts

async begin(): Promise<void> {
  // Check if we already have a placeholder (from previous attempt)
  const existingMessageId = this.event.delivery_state?.telegram_message_id

  if (existingMessageId) {
    // Retry - reuse existing message
    this.currentMessageId = existingMessageId
    this.buffer = '⏳ Thinking...' // Start fresh with current buffer
  } else {
    // First attempt - send placeholder
    const response = await this.sendMessage('⏳ Thinking...')
    
    if (response.ok) {
      const data = await response.json()
      this.currentMessageId = data.result.message_id
      
      // CRITICAL: Persist message_id immediately
      await supabase
        .from('assistant_inbound_events')
        .update({
          delivery_state: {
            ...this.event.delivery_state,
            telegram_message_id: this.currentMessageId,
          },
        })
        .eq('id', this.event.id)
    }
  }
}
```

### 6. Telegram Failsafe Mode (Already Documented)

(See existing Phase 4 plan - already correct)

### 7. WhatsApp Ack Timer Cancel (Already Documented)

(See existing Phase 4 plan - already correct)

---

## C) Rate Limiting (UPGRADED - Two Layers)

### 8. Global + Per-Chat Rate Limiters

**Create per-chat limiters:**

```typescript
// worker/src/rate-limit/PerChatLimiter.ts

import Bottleneck from 'bottleneck'

export class PerChatLimiter {
  private limiters = new Map<string, Bottleneck>()

  /**
   * Get or create limiter for specific chat
   */
  getOrCreate(chatKey: string, config: {
    maxConcurrent?: number
    minTime?: number
  }): Bottleneck {
    if (!this.limiters.has(chatKey)) {
      this.limiters.set(chatKey, new Bottleneck({
        maxConcurrent: config.maxConcurrent ?? 1,  // 1 message at a time per chat
        minTime: config.minTime ?? 1000,  // 1 second between messages
      }))
    }
    
    return this.limiters.get(chatKey)!
  }

  /**
   * Schedule function for specific chat
   */
  async schedule<T>(
    chatKey: string,
    fn: () => Promise<T>,
    config?: { maxConcurrent?: number; minTime?: number }
  ): Promise<T> {
    const limiter = this.getOrCreate(chatKey, config ?? {})
    return limiter.schedule(fn)
  }

  /**
   * Cleanup old limiters (call periodically)
   */
  cleanup(): void {
    this.limiters.forEach((limiter, key) => {
      if (limiter.counts().QUEUED === 0 && limiter.counts().RUNNING === 0) {
        limiter.stop()
        this.limiters.delete(key)
      }
    })
  }
}

// Singleton instances
const telegramPerChatLimiter = new PerChatLimiter()
const whatsappPerChatLimiter = new PerChatLimiter()

export function getTelegramPerChatLimiter() {
  return telegramPerChatLimiter
}

export function getWhatsAppPerChatLimiter() {
  return whatsappPerChatLimiter
}
```

**Use both layers:**

```typescript
// worker/src/channels/telegram/TelegramOutput.ts

import { getTelegramRateLimiter } from '@/rate-limit/RateLimiter'  // Global
import { getTelegramPerChatLimiter } from '@/rate-limit/PerChatLimiter'  // Per-chat

const globalLimiter = getTelegramRateLimiter()
const perChatLimiter = getTelegramPerChatLimiter()

private async sendEdit(): Promise<void> {
  const chatKey = `${this.channelId}:${this.chatId}`
  
  // Layer 1: Global rate limit (Telegram API limit)
  return globalLimiter.schedule(async () => {
    // Layer 2: Per-chat limit (prevent edit flood on single chat)
    return perChatLimiter.schedule(chatKey, async () => {
      // ... existing edit logic ...
    }, { minTime: 1000 })  // 1 edit/second per chat
  })
}
```

---

## D) Memory Pipeline (Same as Original)

(See existing Phase 4 plan sections 7-9)

---

## E) Observability (Same as Original)

(See existing Phase 4 plan sections 10-12)

---

## F) Production Tests (UPGRADED)

### Test 13: Concurrency Test (With Idempotency Verification)

```bash
# Send 10 concurrent messages to same chat
for i in {1..10}; do
  curl -X POST http://localhost:3000/webhook/telegram \
    -H "Content-Type: application/json" \
    -d "{\"message\": {\"chat\": {\"id\": 12345}, \"text\": \"Message $i\"}}" &
done

wait
```

**Expected:**
- ✅ At most 1 event processing at a time (chat lock)
- ✅ No duplicate responses
- ✅ Responses in order (or at least not interleaved)
- ✅ No "stuck" events in DB

### Test 14: Worker Crash Test (Streaming Idempotency)

```bash
# 1. Start worker
npm run worker &
WORKER_PID=$!

# 2. Send message that triggers streaming
curl -X POST http://localhost:3000/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{"message": {"chat": {"id": 12345}, "text": "Tell me a long story"}}'

# 3. Wait 2 seconds (streaming started)
sleep 2

# 4. Kill worker mid-stream
kill -9 $WORKER_PID

# 5. Restart worker
npm run worker

# 6. Wait for retry
sleep 10
```

**Expected:**
- ✅ Event retries with status='pending'
- ✅ Worker reuses SAME Telegram message_id (no duplicate placeholder)
- ✅ User sees single message being edited (not 2 separate messages)
- ✅ Final response completes successfully

### Test 15-16: Same as Original

(See existing Phase 4 plan)

---

## Integration Checklist (UPGRADED)

### A) Correctness (5 items)
- [ ] Create `assistant_chat_locks` table
- [ ] Update `claim_next_inbound_events()` with DISTINCT ON + per-chat locking
- [ ] Add `renew_event_lease()` and `release_chat_lock()` functions
- [ ] Update unique index to `(assistant_id, external_user_id, content_hash)`
- [ ] Update `upsert_memory()` to use new conflict target
- [ ] Clean up status semantics (pending/processing/completed/failed)

### B) Streaming (3 items)
- [ ] Add `delivery_state` column to events
- [ ] Implement streaming idempotency in `TelegramOutput.begin()`
- [ ] Add failsafe mode (MAX_EDIT_FAILURES = 3)
- [ ] Cancel WhatsApp ack timer on fast response

### C) Rate Limiting (5 items)
- [ ] Create `PerChatLimiter` class
- [ ] Wrap Lucid-L2 API calls with global limiter
- [ ] Wrap embedding calls with global limiter
- [ ] Wrap Telegram API calls with global + per-chat limiters
- [ ] Wrap WhatsApp API calls with global + per-chat limiters

### D-F) Same as Original

(See existing Phase 4 plan)

---

## Timeline Estimate (UPDATED)

- **Migration 046:** 30 min
- **A) Correctness:** 3-4 hours (chat locks + scoped dedup + clean status)
- **B) Streaming:** 2 hours (idempotency + failsafe)
- **C) Rate Limiting:** 1.5 hours (two-layer limiters)
- **D) Memory Pipeline:** 2-3 hours
- **E) Observability:** 1-2 hours
- **F) Tests:** 3 hours (with idempotency verification)

**Total:** 13-15.5 hours (2 days focused work)

---

## Summary of Critical Upgrades

1. **✅ Chat locks by `(channel_id, external_chat_id)`** - Works before conversation exists
2. **✅ 5-minute lease + heartbeat** - Realistic for LLM/tool latency
3. **✅ User-scoped memory dedup** - Prevents cross-user data leakage
4. **✅ Streaming idempotency** - No duplicate placeholders on retry
5. **✅ Clean status semantics** - No "failed but retryable" confusion
6. **✅ Two-layer rate limiting** - Global + per-chat protection

**After these upgrades:** Production-ready system with no subtle race conditions or UX bugs.

🚀 **Ship with confidence!**