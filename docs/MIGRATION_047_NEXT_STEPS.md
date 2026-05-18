# Migration 047 v6 - Next Steps & Critical Fix

**Date:** February 5, 2026, 9:49 AM (UTC+1)  
**Status:** Migration 047 v6 deployed ✅ | Memory fix REQUIRED 🚨

---

## 🚨 CRITICAL FIX REQUIRED: Memory Deduplication Bug

### The Problem

**Migration 045 has a data leakage bug in memory deduplication:**

```sql
-- CURRENT (BROKEN):
CREATE INDEX idx_memory_content_hash 
  ON assistant_memory(assistant_id, content_hash);
```

**Issue:** Memory is deduplicated by `(assistant_id, content_hash)` ONLY - NO user scoping!

**Result:** Cross-user data leakage!
- User A (Telegram): "My favorite color is blue" → hash=abc123
- User B (WhatsApp): "My favorite color is blue" → hash=abc123 → **COLLISION!**
- User B might see User A's memories (privacy violation!)

---

## Last Fix: Deploy Memory Upgrade (URGENT)

### Priority: 🔴 CRITICAL - Data Leakage Risk

**Fix:** Add `external_user_id` to memory dedup index (Phase 4 upgrade)

```sql
-- DROP old broken index
DROP INDEX IF EXISTS idx_memory_content_hash;

-- CREATE user-scoped dedup index
CREATE UNIQUE INDEX idx_memory_unique_content
  ON assistant_memory(assistant_id, external_user_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- UPDATE upsert_memory() function to use new conflict target
CREATE OR REPLACE FUNCTION upsert_memory(
  p_assistant_id UUID,
  p_external_user_id TEXT,
  p_content TEXT,
  p_category TEXT DEFAULT 'fact',
  p_importance NUMERIC DEFAULT 0.5,
  p_conversation_id UUID DEFAULT NULL,
  p_source_message_id UUID DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_hash TEXT;
  v_memory_id UUID;
BEGIN
  -- Compute content hash for dedup
  v_hash := md5(lower(trim(p_content)));
  
  -- Upsert with USER-SCOPED dedup
  INSERT INTO assistant_memory (
    assistant_id, external_user_id, content, content_hash, 
    embedding, category, importance, source_message_id, metadata, conversation_id
  ) VALUES (
    p_assistant_id, p_external_user_id, p_content, v_hash,
    p_embedding, p_category, p_importance, p_source_message_id, p_metadata, p_conversation_id
  )
  ON CONFLICT (assistant_id, external_user_id, content_hash)
  DO UPDATE SET
    importance = GREATEST(assistant_memory.importance, EXCLUDED.importance),
    last_accessed_at = NOW(),
    metadata = COALESCE(assistant_memory.metadata, '{}') || EXCLUDED.metadata
  RETURNING id INTO v_memory_id;
  
  RETURN v_memory_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_memory TO service_role;
```

**Timeline:** Deploy ASAP (before memory extraction runs on production traffic)

---

## Next Steps (Priority Order)

### Step 1: Deploy Memory Fix (URGENT - Today)

**Action:**
1. Create migration file: `migrations/048_memory_user_scoped_dedup.sql`
2. Copy SQL above into migration
3. Test in staging (if available)
4. Deploy to production
5. Verify:
   ```sql
   -- Verify new index exists
   SELECT indexname, indexdef 
   FROM pg_indexes 
   WHERE indexname = 'idx_memory_unique_content';
   
   -- Verify function updated
   SELECT routine_name, specific_name 
   FROM information_schema.routines 
   WHERE routine_name = 'upsert_memory';
   ```

**Risk if delayed:** Active users' memories may leak across users!

---

### Step 2: Update Worker Code (Same Day)

**File:** `worker/src/memory/MemoryExtractor.ts`

**Change:**
```typescript
// BEFORE (broken):
await supabase.rpc('upsert_memory', {
  p_assistant_id: assistantId,
  p_content: fact.content,
  p_category: fact.category,
  p_importance: fact.importance,
  p_conversation_id: conversationId,
  p_embedding: JSON.stringify(embedding),
  p_metadata: { ... }
})

// AFTER (fixed):
await supabase.rpc('upsert_memory', {
  p_assistant_id: assistantId,
  p_external_user_id: externalUserId,  // ← ADD THIS!
  p_content: fact.content,
  p_category: fact.category,
  p_importance: fact.importance,
  p_conversation_id: conversationId,
  p_embedding: JSON.stringify(embedding),
  p_metadata: { ... }
})
```

**Verify:** Check that `externalUserId` is available in the worker context (from `assistant_inbound_events.external_user_id`)

---

### Step 3: Monitor Production (Ongoing)

**Monitor for:**
1. **Telegram Messages:**
   - No collision errors (FIX #4 + FIX #5 working)
   - Messages storing correctly
   - No duplicate processing

2. **WhatsApp:**
   - Phone number reuse working (FIX #7)
   - No duplicate channels (FIX #6 + FIX #8)
   - Messages routing correctly

3. **Memory:**
   - No cross-user leakage (after memory fix deployed)
   - Dedup working per-user
   - No constraint violations

**Tools:**
- Check Supabase logs for constraint violations
- Check Sentry for errors
- Monitor `assistant_inbound_events` status (no stuck events)

**Queries:**
```sql
-- Check for stuck events (processing > 5 minutes)
SELECT id, status, channel_id, external_chat_id, created_at, locked_until
FROM assistant_inbound_events
WHERE status = 'processing'
  AND lease_expires_at < NOW();

-- Check for failed events
SELECT id, status, attempts, error_message, created_at
FROM assistant_inbound_events
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;

-- Check memory dedup (after fix)
SELECT assistant_id, external_user_id, COUNT(*) as duplicate_count
FROM assistant_memory
WHERE content_hash IS NOT NULL
GROUP BY assistant_id, external_user_id, content_hash
HAVING COUNT(*) > 1;
```

---

### Step 4: Strategic Decision - Conversation Architecture (This Week)

**Choose ONE approach:**

#### Option A: Keep Isolated Conversations (Current)
- ✅ Simpler (no changes needed)
- ✅ Privacy (Telegram ≠ WhatsApp)
- ❌ Context lost when switching channels
- **Best for:** Different use cases per channel (work vs personal)

#### Option B: Unified Conversations (Requires Changes)
- ✅ Seamless cross-channel experience
- ✅ Context preserved everywhere
- ❌ More complex (user identity linking)
- ❌ Privacy concerns (requires user consent)
- **Best for:** Single "personal AI" across all platforms

**If choosing Option B:**
1. Create `user_identities` table
2. Build user linking flow ("Link Telegram to WhatsApp?")
3. Update conversation routing to use `internal_user_id`
4. Update memory retrieval to pull from unified user

**Timeline:** 1-2 weeks planning + 1 week implementation

---

### Step 5: Phase 4 Full Integration (Next 2 Weeks)

**From:** `docs/PHASE_4_INTEGRATION_PLAN_UPGRADED.md`

**Remaining work:**
1. ✅ Migration 046: DB-backed locks (DONE in 047)
2. ✅ Migration 047: WhatsApp routing (DONE)
3. 🔄 Migration 048: Memory fix (IN PROGRESS - Step 1)
4. ⏳ Streaming idempotency (TelegramOutput.begin())
5. ⏳ Two-layer rate limiting (global + per-chat)
6. ⏳ Memory pipeline (extractor, deduper, embedder)
7. ⏳ Production tests (concurrency, worker crash, etc.)

**Estimated timeline:** 13-15 hours (2 days focused work)

---

## Immediate Action Items (Today)

| Priority | Task | Est. Time | Owner |
|----------|------|-----------|-------|
| 🔴 **P0** | Create migration 048 (memory fix) | 15 min | Dev |
| 🔴 **P0** | Deploy migration 048 to production | 5 min | Dev |
| 🔴 **P0** | Verify memory index + function | 5 min | Dev |
| 🔴 **P0** | Update worker code (add external_user_id) | 30 min | Dev |
| 🔴 **P0** | Deploy worker update | 5 min | Dev |
| 🟡 **P1** | Monitor production logs (1 hour) | 60 min | Dev/Ops |
| 🟡 **P1** | Run production health checks | 15 min | Dev |

**Total critical path:** ~2 hours

---

## Success Criteria

### Today (Migration 048 + Worker Update)
- ✅ Memory dedup index updated to user-scoped
- ✅ `upsert_memory()` function uses new conflict target
- ✅ Worker code passes `external_user_id`
- ✅ No memory leakage between users (verified via query)

### This Week (Monitoring)
- ✅ Telegram messages: No collisions, no stuck events
- ✅ WhatsApp messages: Routing correctly, no duplicates
- ✅ Memory: User-scoped, no cross-contamination
- ✅ No production errors related to 047 or 048

### Next 2 Weeks (Phase 4 Completion)
- ✅ Streaming idempotency implemented
- ✅ Rate limiting deployed
- ✅ Memory pipeline complete
- ✅ Production tests passing
- ✅ Strategic decision made (isolated vs unified)

---

## Emergency Contacts

If issues arise:
- **Database errors:** Check Supabase logs + Sentry
- **Worker crashes:** Check worker logs + restart
- **Memory leakage:** Run dedup query (see Step 3)
- **Rollback needed:** See `MIGRATION_047_v6_FINAL_REPORT.md`

---

**Next update:** After migration 048 deployed (ETA: 2 hours)

🚀 **Let's fix that memory bug and ship Phase 4!**