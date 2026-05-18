This Phase 4 plan is **exactly the right shape** (wire the primitives + fix the Supabase advisory-lock issue + add DB-level dedup + apply rate limits everywhere). Before your dev executes it “as written”, I’d make **6 surgical upgrades** so you don’t ship a subtle reliability/UX regression.

---

## ✅ 1) Conversation locks: row-lock columns are correct… but make them **work with your current event schema**

Your dev proposes:

> `assistant_conversations.processing_lock_until`

That’s perfect **only if** inbound events already reference a stable conversation row **at claim time**.

### The production-safe pattern (Supabase-friendly)

Pick the lock key you *definitely* have at insert-time:

* **Best key for chat platforms:** `(channel_id, external_chat_id)`
  (because that exists in the webhook payload before you “getOrCreateConversation”.)

**Recommendation:** create a small lock table keyed by `channel_id + external_chat_id` OR store those lock columns directly on a conversations table that is created *before* claiming.

**Why this matters:** if you can’t enforce the lock inside the **claim RPC**, you’ll still get races (two workers can claim two events from the same chat and stream twice).

### Minimal schema (Migration 046)

```sql
-- Chat lock table (works even if conversations are created later)
CREATE TABLE IF NOT EXISTS assistant_chat_locks (
  channel_id UUID NOT NULL,
  external_chat_id TEXT NOT NULL,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  PRIMARY KEY (channel_id, external_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_locks_until
  ON assistant_chat_locks (locked_until)
  WHERE locked_until IS NOT NULL;
```

Then in `claim_next_inbound_events()`:

* select ready events
* **try to acquire lock row** for each event’s `(channel_id, external_chat_id)`
* only return events whose lock acquisition succeeded

✅ **TODO for dev**

* Implement lock acquisition **inside claim RPC** (single transaction).
* Enforce **at most 1 claimed event per chat** (use `DISTINCT ON (channel_id, external_chat_id)`).

---

## ✅ 2) Your inbound lease looks too short (30 seconds) for real LLM/tool latency

Your current claim example sets:

* `locked_until = now() + 30 seconds`

Even with heartbeat renewal, 30s is brittle in production (GC pauses, network hiccups, long tool calls, rate limiting).

**Recommendation**

* Set lease to **2–5 minutes**
* Heartbeat renewal every **20–30 seconds**
* Cleanup considers “stuck” only after **lease expired + grace** (e.g., 2 minutes)

✅ **TODO**

* Change claim lease duration to 2–5 minutes
* `renew_event_lease()` extends to `now() + 2–5 minutes`

---

## ✅ 3) Memory dedup unique index should include the user/chat scope

Your dev suggests:

> unique `(assistant_id, content_hash)`

That will accidentally dedupe across different users if the same assistant serves multiple users (or group chats). You almost always want:

* `(assistant_id, external_user_id, content_hash)`
  or `(assistant_id, external_chat_id, content_hash)`

✅ **Migration 046 fix**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_unique_content
  ON assistant_memory (assistant_id, external_user_id, content_hash)
  WHERE content_hash IS NOT NULL;
```

Also ensure your `upsert_memory()` uses `INSERT ... ON CONFLICT DO UPDATE` on that unique index, so dedup is **atomic**.

---

## ✅ 4) Streaming idempotency: store the Telegram placeholder message_id in DB

This is the quietest footgun in streaming systems:

* Worker sends “Thinking…” placeholder (Telegram message_id created)
* Worker crashes mid-stream
* Event retries → you create **another** placeholder → user sees duplicates / confusion

**Fix:** As soon as you create the placeholder, persist `telegram_message_id` to the inbound event (or a delivery-state table), so retries edit the *same* message.

✅ **TODO**

* Add `delivery_state jsonb` (or reuse `metadata jsonb`) on `assistant_inbound_events`
* Save `{ telegram_message_id }` after `begin()`
* On retry, if message_id exists → `editMessageText` instead of `sendMessage`

This is what makes your “worker crash test” actually pass with streaming.

---

## ✅ 5) Claim semantics: keep statuses clean (avoid “failed but retryable”)

Your claim function includes:

* `status = 'failed' AND attempts < max_attempts AND next_attempt_at < now()`

That’s mixing “final failed” with “retry scheduled”. Cleaner contract:

* **Retryable:** `status='pending'` + `next_attempt_at`
* **Processing:** `status='processing'` + lease
* **Terminal:** `status='failed'` (no retry)

✅ **TODO**

* Don’t claim from `failed` unless you introduce `failed_retryable` or similar.
* On error: set `pending` with `next_attempt_at`, and only set `failed` when final.

---

## ✅ 6) RateLimiter wiring: enforce two layers

You already have Bottleneck; make sure you apply:

1. **Global limiter per provider** (Lucid-L2, embeddings, Telegram, WhatsApp)
2. **Per-channel/per-chat limiter** (prevents rapid edits or message bursts on a single chat)

✅ **TODO**

* `telegramEditsLimiter` separate from `telegramSendLimiter`
* Per-chat key limiter for Telegram edits (prevents “edit flood”)

---

# What I would approve as “Production-grade core” after Phase 4

If you implement the 6 fixes above, then your Phase 4 checklist is genuinely sufficient to ship to early users.

### Final “Phase 4” ordering (best ROI)

1. **Locking inside claim RPC** (per chat) + claim 1 event per chat
2. **Lease duration update** (2–5 min) + heartbeat
3. **Memory unique index scoped by external_user/chat**
4. **Streaming idempotency (persist placeholder message_id)**
5. Wire Bottleneck everywhere
6. Init Pino + Sentry + correlation IDs
7. Run the 4 production tests

---

## Quick answer to your implicit concern

Your dev’s plan is very good, but **without**:

* lock enforced at claim-time using a key you have at insert-time, and
* streaming placeholder idempotency,

…you’ll still see “weird” production bugs (double replies, out-of-order, duplicate Telegram messages) even if everything else is perfect.

If you paste your current `claim_next_inbound_events()` SQL (and whether inbound events have `conversation_id` or just `external_chat_id`), I can rewrite the exact **transaction-safe** version that locks per chat and returns one event per chat per batch.
# Phase 4: Production Integration Plan

## Critical Issues from Dev Review

Your dev identified several "quiet production footguns" that must be fixed before shipping. This document provides concrete implementation steps for each issue.

---

## A) Correctness Fixes

### 1. Replace Advisory Locks with Row-Level Locks

**Problem:** Supabase uses pooled connections via PostgREST. Advisory locks are session-scoped and will:
- Not persist across calls (ineffective)
- Leak/block unrelated work if connections are reused

**Solution:** Use DB-visible row locks on the conversation table.

#### Step 1: Add lock columns to conversations table

```sql
-- Migration 046: Row-level conversation locks
ALTER TABLE assistant_conversations 
  ADD COLUMN IF NOT EXISTS processing_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_locked_by TEXT;

-- Index for fast lock lookups
CREATE INDEX IF NOT EXISTS idx_conversations_lock 
  ON assistant_conversations(processing_lock_until) 
  WHERE processing_lock_until IS NOT NULL;

COMMENT ON COLUMN assistant_conversations.processing_lock_until IS 
  'Lock expires at this time (2min timeout)';
COMMENT ON COLUMN assistant_conversations.processing_locked_by IS 
  'Worker ID that owns the lock';
```

#### Step 2: Update claim logic to respect locks

```sql
-- Update claim_next_inbound_events to skip locked conversations
CREATE OR REPLACE FUNCTION claim_next_inbound_events(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10
)
RETURNS SETOF inbound_events
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_ids UUID[];
  v_conversation_ids UUID[];
BEGIN
  -- Find events whose conversations are NOT locked (or lock expired)
  SELECT array_agg(e.id), array_agg(e.conversation_id)
  INTO v_event_ids, v_conversation_ids
  FROM inbound_events e
  LEFT JOIN assistant_conversations c ON e.conversation_id = c.id
  WHERE e.status = 'pending'
    AND e.attempts < 5
    AND e.process_after <= NOW()
    AND (
      c.processing_lock_until IS NULL 
      OR c.processing_lock_until < NOW()
    )
  ORDER BY e.process_after ASC
  LIMIT p_batch_size;

  -- Lock the conversations (atomic)
  UPDATE assistant_conversations
  SET 
    processing_lock_until = NOW() + INTERVAL '2 minutes',
    processing_locked_by = p_worker_id
  WHERE id = ANY(v_conversation_ids);

  -- Claim the events
  UPDATE inbound_events
  SET 
    status = 'processing',
    attempts = attempts + 1,
    claimed_by = p_worker_id,
    claimed_at = NOW()
  WHERE id = ANY(v_event_ids);

  -- Return claimed events
  RETURN QUERY
  SELECT * FROM inbound_events
  WHERE id = ANY(v_event_ids);
END;
$$;

-- Grant to service role
GRANT EXECUTE ON FUNCTION claim_next_inbound_events TO service_role;
```

#### Step 3: Release lock on completion/failure

```sql
-- Release conversation lock (called after processing)
CREATE OR REPLACE FUNCTION release_conversation_lock(
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE assistant_conversations
  SET 
    processing_lock_until = NULL,
    processing_locked_by = NULL
  WHERE id = p_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION release_conversation_lock TO service_role;
```

#### Step 4: Update ConversationLock.ts (or deprecate it)

Since locking is now handled in the claim RPC, you can:
- **Option A:** Remove `ConversationLock.ts` entirely (recommended)
- **Option B:** Keep it as a fallback but document it's not the primary lock mechanism

**Recommended:** Delete `worker/src/locks/ConversationLock.ts` and rely on DB-level locks.

---

### 2. Add Unique Constraint for Memory Dedup

**Problem:** Without a DB constraint, two workers (or retries) can insert duplicate memories.

**Solution:** Add unique index on `(assistant_id, content_hash)`.

```sql
-- Migration 046: Add unique constraint for memory dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_unique_content
  ON assistant_memory(assistant_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- If you want category-specific buckets (optional):
-- CREATE UNIQUE INDEX idx_memory_unique_content_by_category
--   ON assistant_memory(assistant_id, category, content_hash)
--   WHERE content_hash IS NOT NULL;
```

**Result:** `upsert_memory()` will now truly deduplicate at the DB level (constraint violation triggers update instead of insert).

---

### 3. Verify Attempts Logic

**Issue:** `claim_next_inbound_events` increments `attempts` automatically. Ensure your retry logic respects this.

**Check in `worker/src/processors/inbound.ts`:**

```typescript
// ✅ CORRECT: Don't manually increment attempts
const events = await claimNextInboundEvents(workerId, batchSize)

// Process each event
for (const event of events) {
  try {
    await processEvent(event)
    await markEventComplete(event.id)
  } catch (error) {
    // DON'T increment attempts here - it's already done by claim RPC
    await markEventFailed(event.id, error.message)
  }
}
```

---

## B) Streaming Delivery Fixes

### 4. Add Failsafe Mode to TelegramOutput

**Problem:** If Telegram edits fail repeatedly, you'll loop forever. Need graceful degradation.

**Solution:** Track edit failures and fall back to "send final message".

```typescript
// worker/src/channels/telegram/TelegramOutput.ts
// Add this to the class:

private editFailures = 0
private readonly MAX_EDIT_FAILURES = 3

async append(chunk: string, isFinal: boolean = false): Promise<void> {
  this.buffer += chunk
  
  // Failsafe: if edit failures exceed threshold, skip to finalize
  if (this.editFailures >= this.MAX_EDIT_FAILURES) {
    if (isFinal) {
      await this.finalize()
    }
    return
  }

  // ... existing throttled edit logic ...

  try {
    await this.sendEdit()
    this.editFailures = 0 // Reset on success
  } catch (error) {
    this.editFailures++
    
    if (this.editFailures >= this.MAX_EDIT_FAILURES) {
      console.warn(`[telegram] Max edit failures reached, falling back to send final`)
      await this.finalize() // Send as new message instead
    } else {
      // Ignore "message not modified" errors
      if (error.message?.includes('message is not modified')) {
        // Expected, skip
      } else {
        throw error
      }
    }
  }
}

async finalize(): Promise<void> {
  // If we never sent a message (edit failures), send as new message
  if (!this.currentMessageId || this.editFailures >= this.MAX_EDIT_FAILURES) {
    await this.sendNewMessage(this.buffer)
  } else {
    // Send final edit
    await this.sendEdit()
  }
  
  this.cleanup()
}

private async sendNewMessage(text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: this.chatId,
      text,
      parse_mode: 'Markdown',
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.statusText}`)
  }
  
  const data = await response.json()
  this.currentMessageId = data.result.message_id
}
```

---

### 5. Cancel WhatsApp Ack Timer on Fast Response

**Problem:** If response is fast (<3s), the ack timer still fires and sends "⏳ Thinking...".

**Solution:** Cancel timer if final response arrives quickly.

```typescript
// worker/src/channels/whatsapp/WhatsAppOutput.ts
// Modify finalize():

async finalize(): Promise<void> {
  // Cancel ack timer if response is fast
  if (this.ackTimer) {
    clearTimeout(this.ackTimer)
    this.ackTimer = null
  }

  // Only send final if we haven't already sent ack
  if (!this.ackSent) {
    await this.sendFinal(this.buffer)
  } else {
    // Ack was sent, send final as separate message
    await this.sendFinal(this.buffer)
  }
  
  this.cleanup()
}
```

---

## C) Wire Rate Limits

### 6. Wrap ALL External API Calls with Rate Limiters

**Current state:** Rate limiters exist but aren't used.

**Solution:** Wrap every external call.

#### Lucid-L2 API (in `worker/src/adapters/lucid-l2.ts`):

```typescript
import { getLucidL2RateLimiter } from '@/rate-limit/RateLimiter'

const rateLimiter = getLucidL2RateLimiter()

export async function invokeLucidModel(params: InvokeParams): Promise<Response> {
  return rateLimiter.schedule(async () => {
    return fetch(`${LUCID_API_URL}/proxy/invoke/model/${params.model}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  })
}
```

#### Telegram API (in `worker/src/channels/telegram/TelegramOutput.ts`):

```typescript
import { getTelegramRateLimiter } from '@/rate-limit/RateLimiter'

const rateLimiter = getTelegramRateLimiter()

private async sendEdit(): Promise<void> {
  return rateLimiter.schedule(async () => {
    // ... existing edit logic ...
  })
}
```

#### WhatsApp API (in `worker/src/channels/whatsapp/WhatsAppOutput.ts`):

```typescript
import { getWhatsAppRateLimiter } from '@/rate-limit/RateLimiter'

const rateLimiter = getWhatsAppRateLimiter()

private async sendFinal(text: string): Promise<void> {
  return rateLimiter.schedule(async () => {
    // ... existing send logic ...
  })
}
```

#### Embeddings (in `worker/src/memory/MemoryEmbedder.ts`):

```typescript
import { getOpenAIRateLimiter } from '@/rate-limit/RateLimiter'

const rateLimiter = getOpenAIRateLimiter()

async embed(text: string): Promise<number[]> {
  return rateLimiter.schedule(async () => {
    // ... existing embed logic ...
  })
}
```

---

## D) Memory Pipeline Wiring

### 7. Retrieve Memories Before Model Call

**In `worker/src/processors/inbound.ts`:**

```typescript
import { MemoryRetriever, MemoryEmbedder } from '@/memory'

// Create instances (ideally singletons)
const embedder = new MemoryEmbedder({
  model: 'text-embedding-3-small',
  lucidApiUrl: LUCID_API_URL,
})

const retriever = new MemoryRetriever(supabase, { embedder })

// Before calling model:
async function processInboundEvent(event: InboundEvent) {
  const { assistant_id, conversation_id, content } = event

  // 1. Retrieve relevant memories
  const memories = await retriever.retrieve(assistant_id, content, {
    limit: 5,
    threshold: 0.7,
  })

  // 2. Build context with memories
  const memoryContext = memories
    .map(m => `- ${m.content} (${m.category})`)
    .join('\n')

  const systemPrompt = `
You are a helpful assistant.

RELEVANT MEMORIES:
${memoryContext}

User: ${content}
`

  // 3. Call model with memory context
  const response = await invokeLucidModel({
    model: assistant.lucid_model,
    prompt: systemPrompt,
  })

  // ... streaming logic ...
}
```

---

### 8. Extract Memories After Finalize (Non-Blocking)

**Problem:** Memory extraction must not block user response latency.

**Solution:** Run extraction in `setImmediate()` (fire-and-forget) with error handling.

```typescript
import { MemoryExtractor, MemoryDeduper, MemoryEmbedder } from '@/memory'
import { logError } from '@/logging/logger'
import { captureError } from '@/monitoring/sentry'

// After finalize():
async function afterResponseFinalized(
  assistantId: string,
  conversationId: string,
  messages: Array<{ role: string; content: string }>
) {
  // Fire-and-forget memory extraction
  setImmediate(async () => {
    try {
      await extractAndStoreMemories(assistantId, conversationId, messages)
    } catch (error) {
      // Never crash the process
      logError(error, { assistantId, conversationId, phase: 'memory_extraction' })
      captureError(error, { assistantId, conversationId })
    }
  })
}

async function extractAndStoreMemories(
  assistantId: string,
  conversationId: string,
  messages: Array<{ role: string; content: string }>
) {
  // 1. Check if extraction is enabled
  const { data: assistant } = await supabase
    .from('ai_assistants')
    .select('memory_strategy, memory_extraction_model')
    .eq('id', assistantId)
    .single()

  if (assistant?.memory_strategy === 'off') {
    return // Extraction disabled
  }

  // 2. Extract memories
  const extractor = new MemoryExtractor({
    model: assistant.memory_extraction_model || 'gpt-4o-mini',
    strategy: assistant.memory_strategy || 'auto',
    lucidApiUrl: LUCID_API_URL,
  })

  const shouldExtract = extractor.shouldExtract(messages.length, assistant.memory_strategy)
  
  if (!shouldExtract) {
    return // Not time to extract yet
  }

  const extractedMemories = await extractor.extract(messages, {
    assistantName: assistant.name,
    userId: assistant.user_id,
  })

  if (extractedMemories.length === 0) {
    return // Nothing to store
  }

  // 3. Deduplicate (client-side)
  const deduper = new MemoryDeduper(supabase)
  const filtered = MemoryDeduper.filterLowQuality(extractedMemories)
  const unique = MemoryDeduper.deduplicateBatch(filtered)
  
  // 4. Generate embeddings (batch)
  const embedder = new MemoryEmbedder({
    model: 'text-embedding-3-small',
    lucidApiUrl: LUCID_API_URL,
  })

  const contents = unique.map(m => m.content)
  const embeddings = await embedder.embedBatch(contents)

  // 5. Upsert to DB (with automatic dedup via unique constraint)
  for (let i = 0; i < unique.length; i++) {
    const memory = unique[i]
    const embedding = embeddings[i]

    await supabase.rpc('upsert_memory', {
      p_assistant_id: assistantId,
      p_content: memory.content,
      p_category: memory.category,
      p_importance: memory.importance,
      p_conversation_id: conversationId,
      p_embedding: JSON.stringify(embedding),
      p_metadata: {
        confidence: memory.confidence,
        extraction_model: assistant.memory_extraction_model,
        extracted_at: new Date().toISOString(),
      },
    })
  }

  console.log(`[memory] Stored ${unique.length} memories for assistant ${assistantId}`)
}
```

---

### 9. Add Kill-Switch Feature Flag

**In migration 046:**

```sql
-- Already added in migration 045:
-- memory_strategy TEXT DEFAULT 'auto' CHECK (memory_strategy IN ('auto', 'aggressive', 'conservative', 'off'))

-- To disable globally:
UPDATE ai_assistants SET memory_strategy = 'off';

-- To re-enable:
UPDATE ai_assistants SET memory_strategy = 'auto';
```

---

## E) Observability

### 10. Initialize Pino Logger (Replace console.log)

**In `worker/src/index.ts` (or main entry point):**

```typescript
import { logger } from '@/logging/logger'

// Replace all console.log with logger
// ❌ console.log('Processing event', eventId)
// ✅ logger.info({ eventId }, 'Processing event')

// ❌ console.error('Failed to process', error)
// ✅ logger.error({ err: error, eventId }, 'Failed to process')
```

**Pro tip:** Search/replace across codebase:
```bash
# Find all console.log
grep -r "console.log" worker/src

# Replace with logger.info (manual - requires context)
```

---

### 11. Initialize Sentry at Worker Startup

**In `worker/src/index.ts`:**

```typescript
import { initSentry } from '@/monitoring/sentry'

// Initialize Sentry FIRST (before any other imports that might error)
initSentry({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  release: process.env.RAILWAY_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1, // 10% of transactions
})

// Then start worker
async function main() {
  logger.info('Worker starting...')
  
  // ... worker logic ...
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Worker crashed')
  captureError(error)
  process.exit(1)
})
```

---

### 12. Add Correlation IDs

**Ensure every log line + Sentry event includes:**
- `event_id`
- `assistant_id`
- `conversation_id`
- `channel_id`
- `external_chat_id`

**Pattern:**

```typescript
import { createRequestLogger } from '@/logging/logger'
import { captureError } from '@/monitoring/sentry'

async function processEvent(event: InboundEvent) {
  // Create request-scoped logger
  const reqLogger = createRequestLogger({
    requestId: event.id,
    assistantId: event.assistant_id,
    conversationId: event.conversation_id,
    channel: event.channel_id,
  })

  reqLogger.info('Processing event')

  try {
    // ... process ...
    
    reqLogger.info({ duration: 123 }, 'Event processed successfully')
  } catch (error) {
    reqLogger.error({ err: error }, 'Event processing failed')
    
    // Sentry with same context
    captureError(error, {
      userId: event.user_id,
      assistantId: event.assistant_id,
      conversationId: event.conversation_id,
      channel: event.channel_id,
    })
  }
}
```

---

## F) Production Tests (Minimum)

### 13. Concurrency Test

**Test:** Send 10 messages quickly in same chat → no out-of-order replies.

**Expected:** Row-level locks prevent race conditions; replies arrive in order.

```bash
# Test script
curl -X POST http://localhost:3000/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{"message": {"chat": {"id": 123}, "text": "Message 1"}}' &
curl -X POST http://localhost:3000/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{"message": {"chat": {"id": 123}, "text": "Message 2"}}' &
# ... repeat 10 times
```

**Verify:**
- No duplicate responses
- Responses arrive in order (or at least not interleaved)
- No "stuck" events in DB

---

### 14. Worker Crash Test

**Test:** Kill worker mid-stream → no permanent stuck events; reprocess works.

**Steps:**
1. Start processing event
2. Kill worker (SIGKILL) before completion
3. Restart worker
4. Verify event is reprocessed

**Expected:**
- Event status reverts to `pending` (or stays in `processing` but lock expires)
- Worker picks up event again
- No duplicate responses sent

---

### 15. Rate Limit Test

**Test:** Simulate 429 from Telegram → retries/backoff behave.

**Mock Telegram API:**
```typescript
// Return 429 for first 3 requests, then succeed
let requestCount = 0

app.post('/bot:token/sendMessage', (req, res) => {
  requestCount++
  
  if (requestCount <= 3) {
    res.status(429).json({ error: 'Too many requests' })
  } else {
    res.json({ ok: true, result: { message_id: 123 } })
  }
})
```

**Expected:**
- Bottleneck retries with exponential backoff
- Eventually succeeds after backoff
- No crash

---

### 16. Memory Dedup Test

**Test:** Extract same memory twice → DB dedup prevents duplicates.

**Steps:**
1. Extract memory: "User likes pizza"
2. Extract same memory again: "User likes pizza"
3. Check DB: only 1 row exists

**Expected:**
- `upsert_memory()` updates importance (max of old/new)
- No duplicate rows due to unique constraint

---

## Summary: Integration Checklist

Copy/paste this to your dev:

### A) Correctness
- [ ] Remove advisory locks; add `processing_lock_until`, `processing_locked_by` columns
- [ ] Update `claim_next_inbound_events()` to skip locked conversations
- [ ] Add `release_conversation_lock()` function
- [ ] Add unique index on `(assistant_id, content_hash)` for memory dedup
- [ ] Verify attempts logic (don't double-increment)

### B) Streaming
- [ ] Add failsafe mode to `TelegramOutput` (MAX_EDIT_FAILURES = 3)
- [ ] Handle "message not modified" errors gracefully
- [ ] Cancel WhatsApp ack timer if response arrives quickly

### C) Rate Limits
- [ ] Wrap Lucid-L2 calls with `getLucidL2RateLimiter()`
- [ ] Wrap embedding calls with `getOpenAIRateLimiter()`
- [ ] Wrap Telegram API calls with `getTelegramRateLimiter()`
- [ ] Wrap WhatsApp API calls with `getWhatsAppRateLimiter()`

### D) Memory Pipeline
- [ ] Retrieve memories before model call (`MemoryRetriever.retrieve()`)
- [ ] Extract memories after finalize (`setImmediate()` + error handling)
- [ ] Add kill-switch check (`memory_strategy = 'off'`)

### E) Observability
- [ ] Replace all `console.log` with Pino `logger.info()`
- [ ] Initialize Sentry at worker startup
- [ ] Add correlation IDs to all logs + Sentry events

### F) Tests
- [ ] Concurrency test (10 messages → no out-of-order)
- [ ] Worker crash test (kill mid-stream → reprocess works)
- [ ] Rate limit test (429 → retry/backoff)
- [ ] Memory dedup test (duplicate → only 1 DB row)

---

## Timeline Estimate

- **A) Correctness:** 2-3 hours (migration + claim RPC update)
- **B) Streaming:** 1 hour (failsafe mode + ack timer fix)
- **C) Rate Limits:** 1 hour (wrap all API calls)
- **D) Memory Pipeline:** 2-3 hours (retrieve + extract integration)
- **E) Observability:** 1-2 hours (logger + Sentry init)
- **F) Tests:** 2-3 hours (write + run all tests)

**Total:** 9-13 hours (1-2 days of focused work)

---

## After Integration

Once these are complete, you'll have a **production-ready** system:
- ✅ No race conditions (row-level locks)
- ✅ No duplicate memories (unique constraint)
- ✅ No rate limit crashes (Bottleneck wrappers)
- ✅ Graceful streaming degradation (failsafe mode)
- ✅ Full observability (Pino + Sentry + correlation IDs)
- ✅ Non-blocking memory extraction (setImmediate)
- ✅ Tested under load (concurrency, crash, rate limit, dedup)

**Ship it!** 🚀