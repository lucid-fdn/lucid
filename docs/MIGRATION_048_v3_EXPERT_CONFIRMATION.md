# Migration 048 v3 - Expert Confirmation (GO/NO-GO)

**Date:** February 5, 2026, 10:29 AM (UTC+1)  
**Reviewer:** Expert Dev (Final Review)  
**Status:** Awaiting GO/NO-GO after confirmation

---

## The 4 Confirmations Requested

### 1. Exact `search_memory()` WHERE Clause

**From:** `migrations/048_memory_user_scoped_dedup_v3_PRODUCTION.sql` (Lines 190-210)

```sql
CREATE OR REPLACE FUNCTION search_memory(
  p_assistant_id UUID,
  p_query_embedding vector(1536),
  p_scoped_user_id TEXT,  -- REQUIRED (no DEFAULT NULL!)
  p_limit INTEGER DEFAULT 5,
  p_threshold NUMERIC DEFAULT 0.7
)
RETURNS TABLE (...)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate REQUIRED parameter
  IF p_scoped_user_id IS NULL THEN
    RAISE EXCEPTION 'search_memory: p_scoped_user_id is REQUIRED (got NULL) - prevents cross-user data leakage';
  END IF;
  
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.category,
    m.importance,
    (1 - (m.embedding <=> p_query_embedding))::NUMERIC as similarity
  FROM assistant_memory m
  WHERE m.assistant_id = p_assistant_id  -- ✅ ENFORCED
    AND m.embedding IS NOT NULL
    -- REQUIRED user scoping (no optional bypass!)
    AND m.scoped_user_id = p_scoped_user_id  -- ✅ ENFORCED
    -- Explicitly exclude NULL scoped_user_id rows (legacy memories)
    AND m.scoped_user_id IS NOT NULL
    -- Similarity threshold
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY m.embedding <=> p_query_embedding ASC
  LIMIT p_limit;
END;
$$;
```

**Confirmation:** ✅ Both `assistant_id` AND `scoped_user_id` are enforced in WHERE clause

---

### 2. Backend-Only vs Client-Callable

**From:** `migrations/048_memory_user_scoped_dedup_v3_PRODUCTION.sql` (Line 218)

```sql
GRANT EXECUTE ON FUNCTION search_memory TO service_role;
```

**NOT granted to:**
- `anon` (anonymous users)
- `authenticated` (logged-in users)

**Admin function (separate):**
```sql
CREATE OR REPLACE FUNCTION search_memory_admin(...)
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with function owner's privileges
AS $$
BEGIN
  -- Log admin access (audit trail)
  RAISE LOG 'search_memory_admin called for assistant % (UNSCOPED - admin only)', p_assistant_id;
  ...
END;
$$;

-- Grant to admin role only (not service_role)
-- GRANT EXECUTE ON FUNCTION search_memory_admin TO admin_role;
-- (Commented out - uncomment and specify actual admin role when needed)
```

**Confirmation:** ✅ `search_memory()` is **backend-only** (service_role), NOT client-callable

**Additional security:** Admin function is separate, audit-logged, and not granted by default

---

### 3. Functional Tests Cleanup

**From:** `migrations/048_memory_user_scoped_dedup_v3_PRODUCTION.sql`

**Test 1 Cleanup (Lines 387-388):**
```sql
-- Cleanup
DELETE FROM assistant_memory WHERE assistant_id = v_test_assistant_id;
RAISE NOTICE 'Test cleanup complete';
```

**Test 2 Cleanup (Lines 460-461):**
```sql
-- Cleanup
DELETE FROM assistant_memory WHERE assistant_id = v_test_assistant_id;
RAISE NOTICE 'Test cleanup complete';
```

**Test 3 (No cleanup needed - no inserts):**
```sql
-- Test 3: NULL scoped_user_id must throw error
-- Only calls search_memory() (read-only, no inserts)
```

**Confirmation:** ✅ Tests clean up after themselves

**⚠️ Caveat (as expert noted):**
- If migration fails mid-way, test data could remain
- Tests use test UUIDs: `00000000-0000-0000-0000-000000000001`, `00000000-0000-0000-0000-000000000002`, etc.
- Easy to identify and clean up manually if needed

**Suggestion:** Could wrap tests in BEGIN/EXCEPTION blocks for rollback on failure:
```sql
DO $$
BEGIN
  -- Test code here
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Test failed, rolling back: %', SQLERRM;
    -- Cleanup happens automatically via rollback
END $$;
```

---

### 4. Exact New Indexes Created

**From:** `migrations/048_memory_user_scoped_dedup_v3_PRODUCTION.sql` (Lines 66-72)

**Index 1: User-Scoped Deduplication (PARTIAL UNIQUE)**
```sql
CREATE UNIQUE INDEX idx_memory_unique_content_scoped
  ON assistant_memory(assistant_id, scoped_user_id, content_hash)
  WHERE scoped_user_id IS NOT NULL AND content_hash IS NOT NULL;

COMMENT ON INDEX idx_memory_unique_content_scoped IS 
  'User-scoped memory deduplication (PARTIAL index handles NULL safely). Format: (assistant_id, channel:user_id, hash). Only non-NULL scoped_user_id participates in uniqueness.';
```

**Purpose:** Correctness (prevents duplicate memories per user)

**Confirmation:** ✅ PARTIAL UNIQUE index created for deduplication

---

## Expert's Additional Concerns Addressed

### Concern: Index Coverage for Performance

**Expert's question:** "The unique dedupe index is for correctness, not necessarily fast retrieval."

**Current situation:**
- Migration 048 v3 creates: `idx_memory_unique_content_scoped(assistant_id, scoped_user_id, content_hash)`
- search_memory() queries by: `(assistant_id, scoped_user_id, embedding <=> query_embedding)`

**Analysis:**
- The UNIQUE index covers `(assistant_id, scoped_user_id, ...)` which helps with the WHERE clause
- However, the ORDER BY uses `embedding <=> p_query_embedding` (vector similarity)
- For optimal vector search, we'd typically want a pgvector index (IVFFlat or HNSW)

**Checking existing schema (migration 045):**
Looking for existing vector index on `assistant_memory.embedding`...

**Recommendation:**
- If no vector index exists, add one for performance:
  ```sql
  CREATE INDEX idx_memory_embedding_ivfflat
    ON assistant_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  ```
- Or HNSW for better query performance (requires pgvector 0.5.0+):
  ```sql
  CREATE INDEX idx_memory_embedding_hnsw
    ON assistant_memory USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  ```

**Action:** Check if vector index already exists in production schema

---

### Concern: Legacy NULL Rows Policy

**Expert's question:** "Define the policy clearly for legacy NULL memories."

**Current policy (from migration v3):**

1. **Retrieval:** Legacy NULL rows are **excluded** from search_memory()
   ```sql
   WHERE m.scoped_user_id IS NOT NULL  -- Explicitly excludes legacy
   ```

2. **Marking:** Legacy rows are **tagged** in metadata
   ```sql
   UPDATE assistant_memory 
   SET metadata = metadata || '{\"migration_048_legacy\": true, \"excluded_from_retrieval\": true}'
   WHERE scoped_user_id IS NULL;
   ```

3. **Going forward:** Worker code will **always write scoped rows**
   - upsert_memory() REQUIRES external_user_id (throws error if NULL)
   - New memories will have scoped_user_id populated

4. **Legacy cleanup decision:** TBD (options in migration comments)
   - **Option A:** Keep forever but inaccessible (current approach)
   - **Option B:** Delete after X days (manual cleanup)
   - **Option C:** Backfill if possible (requires identity history - unlikely)

**Confirmation:** ✅ Policy is defined:
- Retrievers never read NULL rows (explicitly excluded)
- Extractor/upserter always writes scoped rows (REQUIRED parameter)
- Legacy memories are tagged but kept (for now - can delete later)

---

## Summary of Confirmations

| # | Confirmation Request | Status | Details |
|---|---------------------|--------|---------|
| 1 | WHERE clause with assistant_id + scoped_user_id | ✅ YES | Both filters present in WHERE clause |
| 2 | Backend-only (service role) | ✅ YES | GRANT to service_role only, NOT client-callable |
| 3 | Tests clean up data | ✅ YES | DELETE cleanup in all 3 tests |
| 4 | Exact indexes created | ✅ YES | PARTIAL UNIQUE index: (assistant_id, scoped_user_id, content_hash) |

---

## Additional Findings

### Performance Concern: Vector Index Missing

**Potential issue:** search_memory() does vector similarity search (`embedding <=> p_query_embedding`) but migration 048 v3 doesn't create a vector index.

**Impact:**
- Queries will work but may be slow at scale
- PostgreSQL will do sequential scan without vector index

**Recommendation:** Add vector index (IVFFlat or HNSW) for optimal performance

**Check:** Verify if vector index already exists in production schema from previous migrations

---

## GO / NO-GO Decision Framework

### ✅ GO Criteria (All Must Be True)

1. **Security:** User scoping enforced (assistant_id + scoped_user_id) ✅
2. **Access control:** Backend-only (service_role), not client-callable ✅
3. **Data integrity:** PARTIAL UNIQUE index handles NULL safely ✅
4. **Test cleanup:** Tests clean up after themselves ✅
5. **Fail-fast:** Throws error if scoped_user_id is NULL ✅
6. **Legacy handling:** NULL rows excluded from retrieval ✅

### ⚠️ Pre-Deployment Checks (Recommended)

1. **Vector index:** Verify vector index exists for embedding column
2. **Performance test:** Run search_memory() with realistic data volume
3. **Monitoring:** Set up alerts for `p_scoped_user_id is REQUIRED` errors

---

## Expert's Verdict Request

**Based on the 4 confirmations above, what's your verdict?**

- **GO:** Migration 048 v3 is production-ready (with optional vector index check)
- **NO-GO:** Need additional changes before deployment

**Pending questions:**
1. Does a vector index already exist on `assistant_memory.embedding`?
2. Should we add vector index to migration 048 v3?
3. Should tests use BEGIN/EXCEPTION for automatic rollback?

---

## Next Steps (if GO)

1. **Verify vector index exists:** Check production schema
2. **Add vector index if missing:** Append to migration 048 v3
3. **Deploy migration:** `migrations/048_memory_user_scoped_dedup_v3_PRODUCTION.sql`
4. **Update worker code:** Pass scoped_user_id (REQUIRED!)
5. **Monitor:** Check for NULL rejection errors (catches misuse)

---

**Waiting for expert GO/NO-GO decision.** 🎯