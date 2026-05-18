-- ============================================================================
-- Migration 048 v8: Memory User-Scoped Deduplication (PRODUCTION-SAFE)
-- ============================================================================
-- 
-- Purpose: Fix cross-user memory data leakage bug in migration 045
-- 
-- BREAKING CHANGE WARNING:
-- This migration adds a NEW 10-param upsert_memory() overload.
-- Old 8-param calls will NO-OP until worker code is updated.
-- 
-- DEPLOYMENT SEQUENCE (REQUIRED):
-- 1. RUN this migration (run in transactional context)
-- 2. DEPLOY updated worker code (MemoryExtractor.ts + MemoryRetriever.ts)
-- 3. VERIFY zero MEMORY_LEGACY_NOOP warnings (24-72h monitoring)
-- 4. RUN migration 049 (removes 8-param overload after confirmation)
-- 
-- DURING DEPLOYMENT:
-- - Old 8-param calls will NO-OP (no memory writes, returns NULL)
-- - Logs MEMORY_LEGACY_NOOP warning for each call
-- - Memory extraction paused until worker updated
-- - No privacy leakage or corruption risk
-- 
-- Changes from v7 → v8 (PRODUCTION FIXES):
-- - Function overloading (SAME name, different signatures)
-- - 8-param upsert_memory() → NO-OP (catches old worker)
-- - 10-param upsert_memory() → real implementation (new worker)
-- - TRULY no defaults for new identity params (fail-fast on signature mismatch)
-- - Per-signature REVOKE/GRANT (both overloads)
-- - Removed explicit BEGIN/COMMIT (document transactional execution)
-- - Distinct log marker: MEMORY_LEGACY_NOOP
-- 
-- Expert Review: Safe rollout plan (backward compatible via overloading)
-- Priority: 🔴 CRITICAL - Confirmed Data Leakage + Safe Deployment
-- ============================================================================

-- ============================================================================
-- IMPORTANT: Transactional Execution
-- ============================================================================
-- 
-- This migration should be executed in a transactional context.
-- 
-- Most migration runners (including Supabase Dashboard) automatically wrap
-- migrations in transactions. Do NOT add explicit BEGIN/COMMIT if your
-- runner already provides this.
-- 
-- If you need to add explicit BEGIN/COMMIT:
--   1. Verify your runner doesn't already wrap migrations
--   2. Add BEGIN; at the start and COMMIT; at the end
--   3. Do NOT use CREATE INDEX CONCURRENTLY (breaks transactions)
-- 
-- On failure: entire migration rolls back (safe to retry)
-- ============================================================================

-- ============================================================================
-- 1. Add Missing Columns
-- ============================================================================

ALTER TABLE assistant_memory 
  ADD COLUMN IF NOT EXISTS external_user_id TEXT;

COMMENT ON COLUMN assistant_memory.external_user_id IS 
  'User identifier from the channel (Telegram user_id, WhatsApp phone, etc.)';

ALTER TABLE assistant_memory 
  ADD COLUMN IF NOT EXISTS scoped_user_id TEXT;

COMMENT ON COLUMN assistant_memory.scoped_user_id IS 
  'Channel-scoped user ID (format: channel_type:external_user_id). Prevents cross-channel collisions. REQUIRED for retrieval (NULL rows are excluded).';

-- ============================================================================
-- 2. Drop Old Broken Index
-- ============================================================================

DROP INDEX IF EXISTS idx_memory_content_hash;

-- ============================================================================
-- 3. Create User-Scoped Dedup Index (PARTIAL - Handles NULL Safely!)
-- ============================================================================

CREATE UNIQUE INDEX idx_memory_unique_content_scoped
  ON assistant_memory(assistant_id, scoped_user_id, content_hash)
  WHERE scoped_user_id IS NOT NULL AND content_hash IS NOT NULL;

COMMENT ON INDEX idx_memory_unique_content_scoped IS 
  'User-scoped memory deduplication (PARTIAL index handles NULL safely). Format: (assistant_id, channel:user_id, hash). Only non-NULL scoped_user_id participates in uniqueness.';

-- ============================================================================
-- 4. Create upsert_memory() Overloads (CRITICAL: Function Overloading!)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4a. OLD 8-param upsert_memory() → NO-OP (catches old worker calls)
-- ----------------------------------------------------------------------------
-- 
-- CRITICAL: This MUST match the exact signature from migration 045
-- Old worker calls this → NO-OP → logs MEMORY_LEGACY_NOOP warning → returns NULL
-- 
-- Parameter list MUST match migration 045:
--   p_assistant_id UUID (required)
--   p_content TEXT (required)
--   p_category TEXT DEFAULT 'fact'
--   p_importance NUMERIC DEFAULT 0.5
--   p_conversation_id UUID DEFAULT NULL
--   p_source_message_id UUID DEFAULT NULL
--   p_embedding vector(1536) DEFAULT NULL
--   p_metadata JSONB DEFAULT '{}'
-- 
-- NULL Return Behavior:
--   Old worker MUST tolerate NULL return value. If old worker cannot handle NULL,
--   it must be deployed immediately after this migration.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_memory(
  p_assistant_id UUID,
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
BEGIN
  -- Log with distinct marker for monitoring
  RAISE WARNING '[MEMORY_LEGACY_NOOP] upsert_memory(8-param) called. Memory NOT written (NO-OP). Returns NULL. Update worker code to pass external_user_id + channel_type.';
  
  -- NO-OP: Do not write memory
  -- This prevents memory corruption during deployment window
  -- Worker must be updated to use new 10-param function
  
  -- Return NULL to indicate no memory was created
  -- IMPORTANT: Old worker must tolerate NULL return value
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION upsert_memory(UUID, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB) IS 
  'v8 DEPRECATED NO-OP (8-param): Logs MEMORY_LEGACY_NOOP warning, does NOT write memory, returns NULL. Old worker must tolerate NULL. Prevents corruption during deployment. REMOVE IN MIGRATION 049 after 24-72h zero-call confirmation.';

-- SECURITY: Per-signature privileges (8-param overload)
REVOKE ALL ON FUNCTION upsert_memory(UUID, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_memory(UUID, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB) TO service_role;

-- ----------------------------------------------------------------------------
-- 4b. NEW 10-param upsert_memory() → REAL (user-scoped implementation)
-- ----------------------------------------------------------------------------
-- 
-- CRITICAL: New identity params have NO defaults (fail-fast on signature mismatch)
-- New worker calls this → writes memory with user scoping
-- 
-- New parameters:
--   p_external_user_id TEXT (REQUIRED - NO DEFAULT)
--   p_channel_type TEXT (REQUIRED - NO DEFAULT)
-- 
-- Why NO defaults:
--   Supabase/PostgREST chooses overload based on keys passed in RPC call.
--   If new worker accidentally omits params:
--     - With DEFAULT NULL: Could route to 10-param overload, hit validation exception
--     - WITHOUT default: Signature mismatch error (fail-fast, clearer)
--   
--   No defaults forces explicit param passing and prevents wrong overload selection.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_memory(
  p_assistant_id UUID,
  p_external_user_id TEXT,  -- NEW: REQUIRED (NO default!)
  p_content TEXT,
  p_category TEXT DEFAULT 'fact',
  p_importance NUMERIC DEFAULT 0.5,
  p_conversation_id UUID DEFAULT NULL,
  p_source_message_id UUID DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_channel_type TEXT  -- NEW: REQUIRED (NO default!)
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_hash TEXT;
  v_scoped_user_id TEXT;
  v_memory_id UUID;
BEGIN
  -- Validate REQUIRED parameters (fail-fast)
  IF p_external_user_id IS NULL OR p_external_user_id = '' THEN
    RAISE EXCEPTION 'upsert_memory(10-param): p_external_user_id is REQUIRED (got NULL or empty string)';
  END IF;
  
  IF p_channel_type IS NULL OR p_channel_type = '' THEN
    RAISE EXCEPTION 'upsert_memory(10-param): p_channel_type is REQUIRED (got NULL or empty string)';
  END IF;
  
  -- Compute content hash for dedup
  v_hash := md5(lower(trim(p_content)));
  
  -- Compute scoped_user_id (channel:user format)
  v_scoped_user_id := p_channel_type || ':' || p_external_user_id;
  
  -- Upsert with USER-SCOPED dedup
  INSERT INTO assistant_memory (
    assistant_id, 
    external_user_id,
    scoped_user_id,
    content, 
    content_hash, 
    embedding, 
    category, 
    importance, 
    source_message_id, 
    metadata, 
    conversation_id
  ) VALUES (
    p_assistant_id, 
    p_external_user_id,
    v_scoped_user_id,
    p_content, 
    v_hash,
    p_embedding, 
    p_category, 
    p_importance, 
    p_source_message_id, 
    p_metadata, 
    p_conversation_id
  )
  ON CONFLICT (assistant_id, scoped_user_id, content_hash)
  WHERE scoped_user_id IS NOT NULL AND content_hash IS NOT NULL
  DO UPDATE SET
    importance = GREATEST(assistant_memory.importance, EXCLUDED.importance),
    last_accessed_at = NOW(),
    metadata = COALESCE(assistant_memory.metadata, '{}') || EXCLUDED.metadata
  RETURNING id INTO v_memory_id;
  
  RETURN v_memory_id;
END;
$$;

COMMENT ON FUNCTION upsert_memory(UUID, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB, TEXT) IS 
  'v8: Upserts memory with user-scoped deduplication (10-param). p_external_user_id and p_channel_type are REQUIRED with NO defaults (throws error if NULL/empty, forces signature match). ON CONFLICT target: (assistant_id, scoped_user_id, content_hash) WHERE both NOT NULL.';

-- SECURITY: Per-signature privileges (10-param overload)
REVOKE ALL ON FUNCTION upsert_memory(UUID, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_memory(UUID, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB, TEXT) TO service_role;

-- ============================================================================
-- 5. Create search_memory() Function (REQUIRED User Scoping)
-- ============================================================================

CREATE OR REPLACE FUNCTION search_memory(
  p_assistant_id UUID,
  p_query_embedding vector(1536),
  p_scoped_user_id TEXT,  -- REQUIRED (no DEFAULT NULL!)
  p_limit INTEGER DEFAULT 5,
  p_threshold NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance NUMERIC,
  similarity NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate REQUIRED parameter (fail-fast)
  IF p_scoped_user_id IS NULL OR p_scoped_user_id = '' THEN
    RAISE EXCEPTION 'search_memory: p_scoped_user_id is REQUIRED (got NULL or empty string) - prevents cross-user data leakage';
  END IF;
  
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.category,
    m.importance,
    (1 - (m.embedding <=> p_query_embedding))::NUMERIC as similarity
  FROM assistant_memory m
  WHERE m.assistant_id = p_assistant_id
    AND m.embedding IS NOT NULL
    AND m.scoped_user_id = p_scoped_user_id
    AND m.scoped_user_id IS NOT NULL  -- Explicitly exclude NULL (legacy memories)
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY m.embedding <=> p_query_embedding ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION search_memory IS 
  'Vector similarity search for memories. p_scoped_user_id is REQUIRED (throws error if NULL/empty) to prevent cross-user data leakage. Explicitly excludes NULL scoped_user_id rows (legacy memories). NO AUDIT LOGGING (use search_memory_admin for audited access).';

-- SECURITY: Per-signature privileges
REVOKE ALL ON FUNCTION search_memory(UUID, vector(1536), TEXT, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_memory(UUID, vector(1536), TEXT, INTEGER, NUMERIC) TO service_role;

-- ============================================================================
-- 6. Create search_memory_admin() Function (Unscoped - Admin Only)
-- ============================================================================

CREATE OR REPLACE FUNCTION search_memory_admin(
  p_assistant_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_threshold NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance NUMERIC,
  similarity NUMERIC,
  scoped_user_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- AUDIT LOGGING: Log admin access for security audit trail
  RAISE LOG '[MEMORY_ADMIN_ACCESS] search_memory_admin called for assistant % by % (UNSCOPED - admin only)', p_assistant_id, current_user;
  
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.category,
    m.importance,
    (1 - (m.embedding <=> p_query_embedding))::NUMERIC as similarity,
    m.scoped_user_id
  FROM assistant_memory m
  WHERE m.assistant_id = p_assistant_id
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY m.embedding <=> p_query_embedding ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION search_memory_admin IS 
  'ADMIN ONLY: Unscoped memory search. Returns ALL user memories (cross-user). AUDIT LOGGED: Logs access to Postgres logs (marker: MEMORY_ADMIN_ACCESS) for security audit trail. Use ONLY for debugging/admin tasks.';

-- SECURITY: Per-signature privileges (admin function - manual grant required)
REVOKE ALL ON FUNCTION search_memory_admin(UUID, vector(1536), INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
-- MANUAL GRANT REQUIRED: GRANT EXECUTE ON FUNCTION search_memory_admin(...) TO admin_role;

-- ============================================================================
-- 7. Backfill Strategy for Existing Memories
-- ============================================================================

UPDATE assistant_memory 
SET metadata = metadata || '{"migration_048_legacy": true, "excluded_from_retrieval": true}'
WHERE scoped_user_id IS NULL;

-- ============================================================================
-- 8. Verification Queries
-- ============================================================================

-- Verify new columns exist
DO $$
DECLARE
  v_external_user_id_exists BOOLEAN;
  v_scoped_user_id_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assistant_memory' AND column_name = 'external_user_id'
  ) INTO v_external_user_id_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assistant_memory' AND column_name = 'scoped_user_id'
  ) INTO v_scoped_user_id_exists;
  
  IF v_external_user_id_exists AND v_scoped_user_id_exists THEN
    RAISE NOTICE 'SUCCESS: Columns added (external_user_id, scoped_user_id)';
  ELSE
    RAISE EXCEPTION 'FAILED: Missing columns';
  END IF;
END $$;

-- Verify new index exists
DO $$
DECLARE
  v_index_def TEXT;
BEGIN
  SELECT indexdef INTO v_index_def
  FROM pg_indexes 
  WHERE indexname = 'idx_memory_unique_content_scoped';
  
  IF v_index_def IS NOT NULL THEN
    RAISE NOTICE 'SUCCESS: Index created (PARTIAL - handles NULL safely)';
  ELSE
    RAISE EXCEPTION 'FAILED: idx_memory_unique_content_scoped not found';
  END IF;
END $$;

-- Verify function overloading (should have TWO upsert_memory signatures)
DO $$
DECLARE
  v_overload_count INTEGER;
  v_record RECORD;
BEGIN
  SELECT COUNT(*) INTO v_overload_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'upsert_memory'
    AND n.nspname = 'public';
  
  IF v_overload_count = 2 THEN
    RAISE NOTICE 'SUCCESS: Function overloading working (2 upsert_memory signatures found)';
    
    -- Show both signatures for verification
    FOR v_record IN
      SELECT pg_get_function_identity_arguments(p.oid) as signature
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'upsert_memory'
        AND n.nspname = 'public'
      ORDER BY pg_get_function_identity_arguments(p.oid)
    LOOP
      RAISE NOTICE '  - upsert_memory(%)', v_record.signature;
    END LOOP;
  ELSE
    RAISE WARNING 'Expected 2 upsert_memory overloads, found %', v_overload_count;
  END IF;
END $$;

-- ============================================================================
-- POST-DEPLOY VERIFICATION (Run After Migration!)
-- ============================================================================

-- EVIDENCE: Check function privileges (per-signature)
-- Expected: ONLY service_role (no PUBLIC/anon/authenticated)
DO $$
DECLARE
  v_record RECORD;
  v_issues INTEGER := 0;
BEGIN
  RAISE NOTICE '=== PRIVILEGE VERIFICATION (Per-Signature) ===';
  
  FOR v_record IN
    SELECT 
      p.proname as routine_name,
      pg_get_function_identity_arguments(p.oid) as signature,
      r.grantee,
      r.privilege_type
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    LEFT JOIN information_schema.routine_privileges r
      ON r.routine_name = p.proname
      AND r.routine_schema = n.nspname
    WHERE p.proname IN ('search_memory','upsert_memory','search_memory_admin')
      AND n.nspname = 'public'
    ORDER BY p.proname, signature, grantee
  LOOP
    RAISE NOTICE 'Function: %(%), Grantee: %, Privilege: %', 
      v_record.routine_name, v_record.signature, v_record.grantee, v_record.privilege_type;
    
    -- Check for unexpected grants
    IF v_record.grantee IN ('PUBLIC', 'anon', 'authenticated') THEN
      RAISE WARNING 'SECURITY ISSUE: % can execute %(%) (should be service_role only!)', 
        v_record.grantee, v_record.routine_name, v_record.signature;
      v_issues := v_issues + 1;
    END IF;
  END LOOP;
  
  IF v_issues = 0 THEN
    RAISE NOTICE 'SUCCESS: Privileges locked down correctly (only service_role has access)';
  ELSE
    RAISE WARNING 'FAILED: % security issues found', v_issues;
  END IF;
END $$;

-- ============================================================================
-- CODE UPDATES REQUIRED
-- ============================================================================
-- 
-- Worker deployment is REQUIRED after migration.
-- Until worker code is updated, memory extraction will NO-OP + log warnings + return NULL.
-- 
-- File: worker/src/memory/MemoryExtractor.ts
-- 
-- AFTER (10 params - uses new upsert_memory overload):
--   const { data, error } = await supabase.rpc('upsert_memory', {
--     p_assistant_id: assistantId,
--     p_external_user_id: externalUserId,  // NEW: From inbound event
--     p_content: memory.content,
--     p_category: memory.category || 'fact',
--     p_importance: memory.importance || 0.5,
--     p_conversation_id: conversationId,
--     p_source_message_id: messageId,
--     p_embedding: embedding,
--     p_metadata: memory.metadata || {},
--     p_channel_type: channelType  // NEW: 'telegram' or 'whatsapp'
--   });
-- 
-- File: worker/src/memory/MemoryRetriever.ts
-- 
-- AFTER (add scoped_user_id parameter):
--   const { data, error } = await supabase.rpc('search_memory', {
--     p_assistant_id: assistantId,
--     p_query_embedding: queryEmbedding,
--     p_scoped_user_id: `${channelType}:${externalUserId}`,  // NEW: REQUIRED!
--     p_limit: limit,
--     p_threshold: threshold
--   });
-- 
-- ============================================================================

-- ============================================================================
-- Summary
-- ============================================================================
-- 
-- v8 CHANGES FROM v7 (PRODUCTION-SAFE FIXES):
-- 1. Function overloading with SAME name (not separate _legacy function)
--    - 8-param upsert_memory() → NO-OP (catches old worker)
--    - 10-param upsert_memory() → real implementation (new worker)
-- 2. TRULY no defaults for new identity params (NO DEFAULT NULL!)
--    - Forces signature match, fail-fast on omission
--    - Prevents Supabase/PostgREST wrong overload selection
-- 3. Per-signature REVOKE/GRANT (both overloads explicitly handled)
-- 4. Removed explicit BEGIN/COMMIT (documented transactional execution instead)
-- 5. Distinct log markers (MEMORY_LEGACY_NOOP, MEMORY_ADMIN_ACCESS)
-- 6. NULL return behavior documented (old worker must tolerate)
-- 7. Verification shows both overload signatures
-- 
-- DEPLOYMENT SEQUENCE:
-- 1. Run this migration (old worker → 8-param NO-OP, logs MEMORY_LEGACY_NOOP, returns NULL)
-- 2. Deploy updated worker code (uses 10-param overload)
-- 3. Monitor for 24-72h (confirm zero MEMORY_LEGACY_NOOP warnings)
-- 4. Run migration 049 (removes 8-param overload)
-- 
-- DURING DEPLOYMENT (Step 1→2):
-- - Old worker: Calls upsert_memory(8 params) → NO-OP + warning logged + NULL returned
-- - Memory extraction: Paused (no writes)
-- - No privacy leakage: NO-OP prevents any data writes
-- - No corruption: No shared pool
-- - IMPORTANT: Old worker must tolerate NULL return value
-- 
-- AFTER DEPLOYMENT (Step 2+):
-- - New worker: Uses upsert_memory(10 params) → proper user scoping
-- - Memory extraction: Resumes with correct user isolation
-- - Monitoring: Check Supabase logs for zero MEMORY_LEGACY_NOOP warnings
-- 
-- SECURITY NOTES:
-- - Transactional execution: Should run in transactional context (auto-rollback on failure)
-- - Privileges locked down: REVOKE from PUBLIC/anon/authenticated PER SIGNATURE
-- - Audit logging: ONLY search_memory_admin() has logging (marker: MEMORY_ADMIN_ACCESS)
-- - Evidence provided: POST-DEPLOY VERIFICATION queries per-signature privileges
-- 
-- ARCHITECTURE NOTE:
-- scoped_user_id format ("channel:user_id") prevents cross-user leakage AND prevents
-- cross-channel collisions, but also prevents identity unification. If unified identity
-- is needed in future, an identity-linking layer will be required.
-- 
-- ============================================================================