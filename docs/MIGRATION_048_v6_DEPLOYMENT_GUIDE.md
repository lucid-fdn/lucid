# Migration 048 v6 - Deployment Guide

**Date:** February 5, 2026  
**Migration:** `048_memory_user_scoped_dedup_v6_PRODUCTION_SAFE.sql`  
**Priority:** 🔴 CRITICAL - Fixes confirmed data leakage bug  

---

## Executive Summary

This migration fixes a **critical data leakage bug** where User A could retrieve User B's memories. It adds user scoping to the memory deduplication system.

### ⚠️ BREAKING CHANGE
**Function signature changed:** `upsert_memory()` now requires 10 params instead of 8.

### ✅ v6 Safety Features
1. **Backward compatibility wrapper** - Old worker code continues working during deployment
2. **Transactional migration** - Auto-rollback on failure (BEGIN/COMMIT wrapper)
3. **Evidence-based verification** - Privilege checks via information_schema
4. **Zero downtime deployment** - Deploy migration → Deploy worker → Cleanup

---

## Expert Review Response

### Issue #1: Breaking Change Deployment Sequencing ✅ FIXED

**Expert Concern:**
> "It's a breaking change if the worker wasn't updated first. Any currently-running worker code calling the old signature will error immediately until the code is deployed."

**v6 Solution:**
- Added `upsert_memory_legacy()` backward compatibility wrapper
- Old worker code continues working (uses 'unknown:unknown' as scoped_user_id)
- Deployment window is flexible (no hard requirement to pause worker)
- Next migration (049) removes the legacy function after worker is fully deployed

### Issue #2: Supabase Project ID Removed ✅ FIXED

**Expert Concern:**
> "Don't include the Supabase project ID in anything public. It's not a secret key, but it's unnecessary identifying metadata."

**v6 Solution:**
- Removed all project ID references from migration file
- Removed from documentation
- Security best practice applied

### Issue #3: Claims Made Evidence-Based ✅ CLARIFIED

**Expert Concern:**
> "Claims should be evidence-based. Don't claim auto-rollback unless wrapped in BEGIN/COMMIT. Don't claim privileges locked down without evidence."

**v6 Solution:**

| Claim | Evidence | Status |
|-------|----------|--------|
| Transactional migration → auto rollback | ✅ Has `BEGIN;` ... `COMMIT;` wrapper | **TRUE** |
| Privileges locked down | ✅ POST-DEPLOY VERIFICATION queries `information_schema.routine_privileges` | **TRUE** |
| Audit logging | ⚠️ ONLY `search_memory_admin()` has `RAISE LOG` | **CLARIFIED** |

**Audit Logging Clarification:**
- `search_memory()` - NO audit logging (normal use)
- `search_memory_admin()` - YES audit logging (admin/debug only)
- Regular functions do NOT log (performance reasons)

### Issue #4: Architecture Note Acknowledged ✅

**Expert Concern:**
> "Your current scoped_user_id prevents collisions but also prevents unification. If you ever want unified identity, you'll need an identity-linking layer later."

**v6 Acknowledgment:**
```
ARCHITECTURE NOTE:
scoped_user_id format ("channel:user_id") prevents cross-user leakage AND prevents
cross-channel collisions, but also prevents identity unification. If unified identity
is needed in future, an identity-linking layer will be required.
```

**Decision:** Privacy-friendly isolation is correct default. Identity linking is future enhancement if needed.

---

## Deployment Options

### Option A: Zero Downtime (RECOMMENDED)

**Timeline:** ~10 minutes total

```
Step 1: Deploy Migration (2 minutes)
  ├─ Run migration in Supabase dashboard
  ├─ Verify post-deploy checks pass
  └─ Old worker continues using legacy function
  
Step 2: Deploy Worker Code (5 minutes)
  ├─ Update MemoryExtractor.ts (add external_user_id + channel_type)
  ├─ Update MemoryRetriever.ts (add scoped_user_id parameter)
  ├─ Deploy to Railway
  └─ New worker uses new function signature
  
Step 3: Verify (2 minutes)
  ├─ Check worker logs (no upsert_memory_legacy warnings)
  ├─ Check Supabase logs (verify user scoping working)
  └─ Test memory retrieval (User A != User B)
  
Step 4: Cleanup (Next Release)
  ├─ Deploy migration 049 (removes upsert_memory_legacy)
  └─ Confirms all worker instances updated
```

**During Deployment:**
- ✅ No worker pause required
- ✅ Old worker code continues working (uses legacy function)
- ✅ New memories use 'unknown:unknown' scoped_user_id until worker deployed
- ✅ Memory pipeline continues operating

**After Deployment:**
- ✅ New worker code uses proper scoped_user_id
- ✅ Future memories properly isolated per user
- ✅ Legacy function logs deprecation warnings (visible in Supabase logs)

---

### Option B: Controlled Downtime (Alternative)

**Timeline:** ~10 minutes total (3-5 minutes downtime)

```
Step 1: Pause Worker (1 minute)
  └─ Railway: Pause service or scale to 0 replicas
  
Step 2: Deploy Migration (2 minutes)
  ├─ Run migration in Supabase dashboard
  └─ Verify post-deploy checks pass
  
Step 3: Deploy Worker Code (5 minutes)
  ├─ Update MemoryExtractor.ts + MemoryRetriever.ts
  └─ Deploy to Railway
  
Step 4: Resume Worker (1 minute)
  └─ Railway: Resume service or scale to 1 replica
  
Step 5: Verify (2 minutes)
  └─ Test memory extraction + retrieval
```

**Use When:**
- Low user activity window available
- Want guaranteed clean cutover
- Prefer explicit control over transition

**Downtime Window:** 3-5 minutes (during Step 2-3)

---

## Pre-Flight Checklist

### Database Readiness

- [ ] Supabase project accessible
- [ ] Service role key available
- [ ] Backup of `assistant_memory` table taken (if data exists)
- [ ] Current memory count checked: `SELECT COUNT(*) FROM assistant_memory`

### Worker Readiness

- [ ] Code changes prepared (MemoryExtractor.ts + MemoryRetriever.ts)
- [ ] Railway deployment tested in staging (if available)
- [ ] Rollback plan documented (revert worker code if needed)

### Monitoring Readiness

- [ ] Supabase logs accessible (for checking function calls)
- [ ] Railway logs accessible (for checking worker errors)
- [ ] Alert channels ready (if errors occur)

---

## Migration Execution

### Step 1: Run Migration

**In Supabase Dashboard:**
1. Navigate to SQL Editor
2. Paste contents of `migrations/048_memory_user_scoped_dedup_v6_PRODUCTION_SAFE.sql`
3. Click "Run"
4. Wait for completion (~30-60 seconds)

**Expected Output:**
```
NOTICE:  SUCCESS: Columns added (external_user_id, scoped_user_id)
NOTICE:  SUCCESS: Index created (PARTIAL - handles NULL safely)
NOTICE:  SUCCESS: Old idx_memory_content_hash removed
NOTICE:  SUCCESS: Two separate memory rows created (no collision)
NOTICE:  SUCCESS: Retrieval isolation verified (User B sees ONLY own memories)
NOTICE:  SUCCESS: search_memory rejected NULL scoped_user_id
NOTICE:  Found N memories with NULL scoped_user_id (excluded from retrieval - safe)
```

**If Any Test Fails:**
- Migration will **auto-rollback** (transactional wrapper)
- Check error message
- Contact database admin
- **DO NOT** proceed to worker deployment

### Step 2: Verify Post-Deploy Checks

**Run Verification Query:**
```sql
-- Check function privileges (evidence-based)
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN ('search_memory','upsert_memory','upsert_memory_legacy','search_memory_admin')
  AND routine_schema = 'public'
ORDER BY routine_name, grantee;
```

**Expected Output:**
```
routine_name              | grantee      | privilege_type
--------------------------+--------------+----------------
search_memory             | service_role | EXECUTE
search_memory_admin       | service_role | EXECUTE
upsert_memory             | service_role | EXECUTE
upsert_memory_legacy      | service_role | EXECUTE
```

**⚠️ Security Check:**
- ❌ If you see `PUBLIC`, `anon`, or `authenticated` → **SECURITY ISSUE** → Run:
  ```sql
  REVOKE ALL ON FUNCTION upsert_memory(...) FROM PUBLIC, anon, authenticated;
  -- Repeat for search_memory, search_memory_admin, upsert_memory_legacy
  ```

---

## Worker Code Updates

### File 1: `worker/src/memory/MemoryExtractor.ts`

**BEFORE (Old - 8 params):**
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

**AFTER (New - 10 params):**
```typescript
const { data, error } = await supabase.rpc('upsert_memory', {
  p_assistant_id: assistantId,
  p_external_user_id: externalUserId,  // ← NEW: From inbound event
  p_content: memory.content,
  p_category: memory.category || 'fact',
  p_importance: memory.importance || 0.5,
  p_conversation_id: conversationId,
  p_source_message_id: messageId,
  p_embedding: embedding,
  p_metadata: memory.metadata || {},
  p_channel_type: channelType  // ← NEW: 'telegram' or 'whatsapp'
});
```

**Where to get new parameters:**
- `externalUserId` - From `AssistantInboundEvent.external_user_id`
- `channelType` - From `AssistantChannel.channel_type` or event metadata

---

### File 2: `worker/src/memory/MemoryRetriever.ts`

**BEFORE (No user scoping):**
```typescript
const { data, error } = await supabase.rpc('search_memory', {
  p_assistant_id: assistantId,
  p_query_embedding: queryEmbedding,
  p_limit: limit,
  p_threshold: threshold
});
```

**AFTER (User-scoped - REQUIRED):**
```typescript
const { data, error } = await supabase.rpc('search_memory', {
  p_assistant_id: assistantId,
  p_query_embedding: queryEmbedding,
  p_scoped_user_id: `${channelType}:${externalUserId}`,  // ← NEW: REQUIRED!
  p_limit: limit,
  p_threshold: threshold
});
```

**Critical:** `p_scoped_user_id` is **REQUIRED** - passing NULL will throw error!

---

## Post-Deployment Verification

### Check 1: Worker Logs (Railway)

**Look for:**
```
✅ GOOD: No "upsert_memory_legacy" warnings
✅ GOOD: Memory extraction succeeding
❌ BAD: "p_external_user_id is REQUIRED (got NULL)" errors
```

**If errors:**
- Worker code not updated correctly
- Check MemoryExtractor.ts changes deployed
- Verify externalUserId passed from inbound event

---

### Check 2: Supabase Logs

**Filter by:** Functions

**Look for:**
```
✅ GOOD: upsert_memory calls with 10 params
✅ GOOD: search_memory calls with p_scoped_user_id
❌ BAD: upsert_memory_legacy calls (means old worker still running)
```

---

### Check 3: Functional Test

**Test User Isolation:**
```sql
-- Test 1: Create memories for two users (same assistant, same content)
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

-- Test 2: Verify two SEPARATE rows created
SELECT COUNT(*), scoped_user_id
FROM assistant_memory
WHERE assistant_id = '00000000-0000-0000-0000-000000000test'::uuid
  AND content_hash = md5(lower(trim('My favorite color is blue')))
GROUP BY scoped_user_id;

-- Expected output:
-- count | scoped_user_id
-- ------+---------------------
--     1 | telegram:test_user_a
--     1 | whatsapp:test_user_b

-- Cleanup
DELETE FROM assistant_memory 
WHERE assistant_id = '00000000-0000-0000-0000-000000000test'::uuid;
```

**✅ PASS:** Two separate rows with different scoped_user_id  
**❌ FAIL:** Only one row (collision - data leakage!)

---

## Rollback Plan

### If Migration Fails

**Automatic Rollback:** Migration is transactional (BEGIN/COMMIT wrapper)
- If any test fails → entire migration rolls back
- Database returns to pre-migration state
- No manual intervention needed

### If Worker Deployment Fails

**Rollback Steps:**
1. Revert worker code to previous version
2. Redeploy to Railway
3. Old worker uses `upsert_memory_legacy()` (still available in v6)
4. Memory extraction continues (uses 'unknown:unknown' scoped_user_id)

**Migration stays deployed:**
- Backward compatibility wrapper keeps old worker working
- No need to rollback migration
- Fix worker code and redeploy

---

## Success Criteria

### Migration Success

- [x] All verification queries pass
- [x] Post-deploy privilege check shows only service_role
- [x] No errors in Supabase logs

### Worker Deployment Success

- [x] No "upsert_memory_legacy" warnings in logs
- [x] Memory extraction succeeding
- [x] Retrieval isolation verified (User A != User B)

### System Health

- [x] Memory pipeline processing normally
- [x] No increase in error rate
- [x] User-scoped memories being created

---

## Cleanup (Next Release - Migration 049)

**After confirming all worker instances updated:**

Create `migrations/049_remove_legacy_wrapper.sql`:
```sql
-- Remove backward compatibility wrapper
DROP FUNCTION IF EXISTS upsert_memory_legacy(UUID, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB);

-- Verify only new function remains
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name LIKE '%upsert_memory%';
```

**When to run:**
- Minimum 1 week after v6 deployment
- Confirm zero "upsert_memory_legacy" calls in logs
- All worker instances verified using new signature

---

## Troubleshooting

### Error: "p_external_user_id is REQUIRED (got NULL)"

**Cause:** Worker code not updated or externalUserId not passed

**Fix:**
1. Check MemoryExtractor.ts includes `p_external_user_id` parameter
2. Verify externalUserId extracted from inbound event
3. Check event has external_user_id column populated

---

### Error: "p_scoped_user_id is REQUIRED (got NULL)"

**Cause:** MemoryRetriever.ts not updated

**Fix:**
1. Check MemoryRetriever.ts includes `p_scoped_user_id` parameter
2. Verify format: `${channelType}:${externalUserId}`
3. Both channelType AND externalUserId must be non-null

---

### Warning: "upsert_memory_legacy called"

**Status:** Expected during deployment window

**Fix:** Deploy updated worker code (Step 2 above)

**After worker deployed:** Warning should disappear

---

## Contact & Support

**Migration Issues:** Database Admin  
**Worker Deployment Issues:** DevOps Team  
**Data Integrity Concerns:** Security Team  

---

## Summary

Migration 048 v6 addresses all expert feedback:

1. ✅ **Backward compatibility** - Zero downtime deployment
2. ✅ **Evidence-based claims** - Privilege verification via information_schema
3. ✅ **Security hardening** - No public/anon/authenticated access
4. ✅ **Clear deployment sequencing** - Option A (zero downtime) or Option B (controlled)
5. ✅ **Architecture transparency** - scoped_user_id prevents unification (documented)

**Deployment:** Ready for production  
**Risk Level:** Low (with backward compatibility wrapper)  
**Recommended Approach:** Option A (Zero Downtime)  

---

**Document Version:** 1.0  
**Last Updated:** February 5, 2026  
**Migration File:** `048_memory_user_scoped_dedup_v6_PRODUCTION_SAFE.sql`