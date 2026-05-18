# Migration 048 v7 - Deployment Guide (PRODUCTION-READY)

**Date:** February 5, 2026  
**Migration:** `048_memory_user_scoped_dedup_v7_PRODUCTION_READY.sql`  
**Priority:** 🔴 CRITICAL - Fixes confirmed data leakage bug  

---

## Executive Summary

This migration fixes a **critical data leakage bug** where User A could retrieve User B's memories. It adds user scoping to the memory deduplication system.

### ⚠️ BREAKING CHANGE
**Function signature changed:** `upsert_memory()` now requires 10 params instead of 8.

### ✅ v7 Safety Features (EXPERT APPROVED)
1. **NO-OP backward compatibility** - Legacy calls do NOT write (prevents corruption!)
2. **Transactional migration** - Auto-rollback on failure (explicit BEGIN/COMMIT)
3. **Evidence-based verification** - Privilege checks via information_schema
4. **Safe deployment** - Memory extraction pauses (acceptable), no privacy leakage

---

## Expert Review Changes (v6 → v7)

### 🔴 CRITICAL FIX: Removed "unknown:unknown" Approach

**v6 Problem (REJECTED):**
```sql
-- ❌ BAD: Collapses all users into shared pool
v_scoped_user_id := 'unknown:unknown'  
-- Result: User A + User B same content → MERGED → CORRUPTION!
```

**v7 Solution (APPROVED):**
```sql
-- ✅ GOOD: NO-OP prevents any writes
RAISE WARNING 'Memory NOT written (NO-OP). Update worker code.';
RETURN NULL;  -- No memory created
```

**Why NO-OP is safer:**
1. **No memory corruption** - No shared "unknown:unknown" pool
2. **No privacy leakage** - No writes = no data to leak
3. **Clear failure mode** - Logs show exactly what needs fixing
4. **Forces proper deployment** - Worker must be updated

---

## Deployment Sequence

### Step 1: Run Migration (2 minutes)
```
1. Navigate to Supabase SQL Editor
2. Paste migration file contents
3. Click "Run"
4. Verify all tests pass
```

**During this step:**
- ✅ Migration creates user-scoped schema
- ✅ Legacy function becomes NO-OP
- ⚠️ Old worker calls will NO-OP + log warnings
- ⚠️ Memory extraction paused until Step 2

---

### Step 2: Deploy Worker Code (5 minutes)
```
1. Update MemoryExtractor.ts (add external_user_id + channel_type params)
2. Update MemoryRetriever.ts (add scoped_user_id param)
3. Deploy to Railway
4. Verify deployment successful
```

**After this step:**
- ✅ New worker uses 10-param function
- ✅ Memory extraction resumes
- ✅ User isolation properly enforced

---

### Step 3: Monitor (24-72 hours)
```
1. Check Supabase logs daily
2. Confirm ZERO "upsert_memory_legacy" warnings
3. Verify memory extraction working
4. Confirm user isolation (User A != User B)
```

**Monitoring queries:**
```sql
-- Check for legacy function calls (should be ZERO after Step 2)
SELECT COUNT(*) 
FROM pg_stat_statements 
WHERE query LIKE '%upsert_memory_legacy%';

-- Verify new memories have scoped_user_id
SELECT COUNT(*), scoped_user_id IS NOT NULL as has_scope
FROM assistant_memory
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY has_scope;
```

---

### Step 4: Cleanup (After 24-72h zero-call confirmation)
```
1. Confirm zero legacy calls for 24-72h
2. Run migration 049 (removes legacy wrapper)
3. Verify only new function remains
```

---

## Evidence-Based Claims

### ✅ Claim: Transactional Migration (Auto-Rollback)

**Proof:**
```sql
BEGIN;
-- ... all migration statements ...
COMMIT;
```

**Evidence:**
- Migration wrapped in explicit `BEGIN;` ... `COMMIT;`
- No `CREATE INDEX CONCURRENTLY` used (would break transaction)
- If ANY statement fails → entire migration rolls back
- Database returns to pre-migration state
- Safe to retry

---

### ✅ Claim: Privileges Locked Down

**Proof:**
```sql
REVOKE ALL ON FUNCTION upsert_memory(...) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_memory(...) TO service_role;
```

**Evidence (run after migration):**
```sql
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN ('search_memory','upsert_memory','upsert_memory_legacy','search_memory_admin')
  AND routine_schema = 'public'
ORDER BY routine_name, grantee;
```

**Expected output:**
```
routine_name         | grantee      | privilege_type
---------------------+--------------+----------------
search_memory        | service_role | EXECUTE
upsert_memory        | service_role | EXECUTE
upsert_memory_legacy | service_role | EXECUTE
search_memory_admin  | service_role | EXECUTE
```

**⚠️ If you see PUBLIC/anon/authenticated → SECURITY ISSUE** → Revoke immediately

---

### ⚠️ Claim: Audit Logging (CLARIFIED)

**Scope:**
- `search_memory()` - **NO** audit logging (performance reasons)
- `upsert_memory()` - **NO** audit logging (performance reasons)
- `upsert_memory_legacy()` - **NO** audit logging (performance reasons)
- `search_memory_admin()` - **YES** audit logging (admin/debug only)

**Audit Logging Code:**
```sql
-- ONLY in search_memory_admin():
RAISE LOG 'search_memory_admin called for assistant % by % (UNSCOPED)', 
  p_assistant_id, current_user;
```

**Why limited scope:**
- Regular functions called thousands of times/day
- Audit logging would create massive log volume
- Performance impact on production workload
- Admin function rarely used → safe to log

---

## Deployment Impact Analysis

### During Deployment Window (Step 1 → Step 2)

**Old Worker Behavior:**
```typescript
// Old worker calls 8-param function
await supabase.rpc('upsert_memory', {
  p_assistant_id: assistantId,
  p_content: memory.content,
  // ... 6 more params (8 total)
});
```

**What happens:**
1. ✅ Call succeeds (no error thrown)
2. ✅ Warning logged: "Memory NOT written (NO-OP)"
3. ⚠️ Memory NOT created (NULL returned)
4. ⚠️ Memory extraction paused

**Impact:**
- **Duration:** Until worker deployed (~5 minutes)
- **User impact:** No new memories extracted (temporary)
- **Data integrity:** Perfect (no corruption, no leakage)
- **Recovery:** Automatic when worker deployed

---

### After Deployment (Step 2+)

**New Worker Behavior:**
```typescript
// New worker calls 10-param function
await supabase.rpc('upsert_memory', {
  p_assistant_id: assistantId,
  p_external_user_id: externalUserId,  // ← NEW
  p_content: memory.content,
  // ... 7 more params
  p_channel_type: channelType  // ← NEW
});
```

**What happens:**
1. ✅ Call succeeds with user scoping
2. ✅ Memory created with scoped_user_id
3. ✅ User isolation enforced
4. ✅ Zero legacy warnings

**Result:**
- **Memory extraction:** Resumed
- **User isolation:** telegram:123 ≠ whatsapp:123
- **Data leakage:** Eliminated
- **Corruption risk:** Eliminated

---

## Worker Code Updates

### File 1: `worker/src/memory/MemoryExtractor.ts`

**BEFORE (8 params):**
```typescript
const { data, error } = await supabase.rpc('upsert_memory', {
  p_assistant_id: assistantId,
  p_content: memory.content,
  p_category: memory.category || 'fact',
  p_importance: memory.importance || 0.5,
  p_conversation_id: conversationId,
  p_source_message_id: messageId,
  p_embedding: embedding,
  p_metadata: memory.metadata || {}
});
```

**AFTER (10 params):**
```typescript
// Extract from inbound event
const externalUserId = event.external_user_id;  // From assistant_inbound_events
const channelType = channel.channel_type;       // 'telegram' or 'whatsapp'

const { data, error } = await supabase.rpc('upsert_memory', {
  p_assistant_id: assistantId,
  p_external_user_id: externalUserId,  // ← NEW
  p_content: memory.content,
  p_category: memory.category || 'fact',
  p_importance: memory.importance || 0.5,
  p_conversation_id: conversationId,
  p_source_message_id: messageId,
  p_embedding: embedding,
  p_metadata: memory.metadata || {},
  p_channel_type: channelType  // ← NEW
});
```

---

### File 2: `worker/src/memory/MemoryRetriever.ts`

**BEFORE (no user scoping):**
```typescript
const { data, error } = await supabase.rpc('search_memory', {
  p_assistant_id: assistantId,
  p_query_embedding: queryEmbedding,
  p_limit: limit,
  p_threshold: threshold
});
```

**AFTER (user-scoped):**
```typescript
// Compute scoped_user_id
const scopedUserId = `${channelType}:${externalUserId}`;  // e.g., "telegram:123456"

const { data, error } = await supabase.rpc('search_memory', {
  p_assistant_id: assistantId,
  p_query_embedding: queryEmbedding,
  p_scoped_user_id: scopedUserId,  // ← NEW: REQUIRED!
  p_limit: limit,
  p_threshold: threshold
});
```

**⚠️ CRITICAL:** `p_scoped_user_id` is REQUIRED - passing NULL will throw error!

---

## Verification & Testing

### Pre-Deployment Checklist

- [ ] Backup `assistant_memory` table
- [ ] Worker code changes ready
- [ ] Supabase dashboard accessible
- [ ] Railway deployment tested in staging
- [ ] Rollback plan documented

---

### Post-Migration Verification

**Run immediately after Step 1:**
```sql
-- Verify columns added
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'assistant_memory' 
  AND column_name IN ('external_user_id', 'scoped_user_id');

-- Expected: 2 rows

-- Verify index created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE indexname = 'idx_memory_unique_content_scoped';

-- Expected: 1 row with WHERE clause

-- Verify privileges locked down
SELECT routine_name, grantee
FROM information_schema.routine_privileges
WHERE routine_name LIKE '%memory%'
  AND routine_schema = 'public';

-- Expected: Only service_role (no PUBLIC/anon/authenticated)
```

---

### Post-Deployment Verification

**Run after Step 2:**
```sql
-- Check for legacy warnings (should be ZERO)
-- (Check Supabase logs, not SQL)

-- Verify new memories have scoped_user_id
SELECT 
  COUNT(*) as total_memories,
  COUNT(scoped_user_id) as scoped_memories,
  COUNT(*) - COUNT(scoped_user_id) as unscoped_legacy
FROM assistant_memory
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Expected after deployment: scoped_memories > 0, unscoped_legacy = 0
```

---

### Functional Test (User Isolation)

```sql
-- Test 1: Two users, same content → TWO separate memories
SELECT upsert_memory(
  '00000000-0000-0000-0000-000000000test'::uuid,
  'test_user_a',
  'My favorite color is blue',
  'fact', 0.8, NULL, NULL, NULL, '{}', 'telegram'
);

SELECT upsert_memory(
  '00000000-0000-0000-0000-000000000test'::uuid,
  'test_user_b',
  'My favorite color is blue',  -- SAME content!
  'fact', 0.8, NULL, NULL, NULL, '{}', 'whatsapp'
);

-- Test 2: Verify TWO rows created (different scoped_user_id)
SELECT COUNT(*), scoped_user_id
FROM assistant_memory
WHERE assistant_id = '00000000-0000-0000-0000-000000000test'::uuid
GROUP BY scoped_user_id;

-- Expected:
-- count | scoped_user_id
-- ------+---------------------
--     1 | telegram:test_user_a
--     1 | whatsapp:test_user_b

-- Cleanup
DELETE FROM assistant_memory 
WHERE assistant_id = '00000000-0000-0000-0000-000000000test'::uuid;
```

**✅ PASS:** Two separate rows  
**❌ FAIL:** Only one row (data leakage!)

---

## Monitoring (24-72 Hours)

### Daily Checks

**Check 1: Legacy Function Calls**
```
Location: Supabase Dashboard → Logs → Filter by "upsert_memory_legacy"
Expected: ZERO warnings after Step 2 deployment
Action if found: Investigate why old worker still running
```

**Check 2: Memory Creation**
```sql
SELECT COUNT(*)
FROM assistant_memory
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND scoped_user_id IS NOT NULL;

-- Expected: > 0 (memories being created with user scoping)
```

**Check 3: User Isolation**
```sql
-- Pick two recent memories from different users
SELECT scoped_user_id, content
FROM assistant_memory
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;

-- Verify: Different users have different scoped_user_id prefixes
-- telegram:123 ≠ telegram:456
-- telegram:123 ≠ whatsapp:+1234567890
```

---

### When to Run Migration 049

**Criteria (ALL must be met):**
- [ ] 24-72 hours passed since Step 2
- [ ] ZERO "upsert_memory_legacy" warnings in logs
- [ ] Memory extraction working normally
- [ ] User isolation verified (test queries passing)
- [ ] No worker rollbacks or redeploys to old version

**Migration 049 (Future):**
```sql
-- Removes backward compatibility wrapper
DROP FUNCTION IF EXISTS upsert_memory_legacy(...);

-- Verify only new function remains
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name LIKE '%upsert_memory%';

-- Expected: Only 'upsert_memory' (10-param version)
```

---

## Rollback Plan

### If Migration Fails (Step 1)

**Automatic Rollback:**
- Migration wrapped in `BEGIN;` ... `COMMIT;`
- If ANY test fails → entire migration rolls back
- Database returns to pre-migration state
- No manual intervention needed

**Action:**
1. Check error message in Supabase logs
2. Fix issue (if schema-related)
3. Retry migration

---

### If Worker Deployment Fails (Step 2)

**Symptoms:**
- "p_external_user_id is REQUIRED (got NULL)" errors
- Memory extraction failing

**Rollback:**
1. Revert worker code to previous version
2. Redeploy to Railway
3. Old worker uses `upsert_memory_legacy()` → NO-OP + warns
4. Memory extraction paused (acceptable)
5. Fix worker code issues
6. Redeploy updated worker

**Migration stays deployed:**
- NO-OP wrapper keeps system stable
- No need to rollback migration
- Fix code and try again

---

## Architecture Note

### scoped_user_id Format

**Pattern:** `channel_type:external_user_id`

**Examples:**
- `telegram:123456789`
- `whatsapp:+1234567890`
- `unknown:user123` (fallback if channel_type not provided)

**Benefits:**
- ✅ Prevents cross-user leakage (User A ≠ User B)
- ✅ Prevents cross-channel collisions (telegram:123 ≠ whatsapp:123)

**Trade-off:**
- ⚠️ Prevents identity unification across channels
- If future requirement: unified identity → identity-linking layer needed
- **Decision:** Privacy-friendly isolation is correct default

---

## Summary

### Migration 048 v7 is Production-Ready

**Expert Review:** ✅ APPROVED (NO-OP approach prevents corruption)

**Safety Features:**
1. ✅ NO-OP backward compatibility (no memory corruption)
2. ✅ Transactional migration (auto-rollback on failure)
3. ✅ Evidence-based privilege verification
4. ✅ Clear deployment sequence with monitoring

**Deployment:**
- **Risk Level:** Low (NO-OP prevents corruption during deployment)
- **Downtime:** None (memory extraction pauses ~5 min, acceptable)
- **Recovery:** Automatic when worker deployed

**Next Steps:**
1. ✅ Review this guide
2. ✅ Prepare worker code changes
3. ✅ Run migration (Step 1)
4. ✅ Deploy worker (Step 2)
5. ✅ Monitor 24-72h (Step 3)
6. ✅ Run migration 049 (Step 4)

**Ready to deploy!**

---

**Document Version:** 2.0 (v7 - Expert Approved)  
**Last Updated:** February 5, 2026  
**Migration File:** `048_memory_user_scoped_dedup_v7_PRODUCTION_READY.sql`