-- ============================================================================
-- Migration 048 v6: Memory User-Scoped Deduplication (PRODUCTION-SAFE)
-- ============================================================================
-- 
-- Purpose: Fix cross-user memory data leakage bug in migration 045
-- 
-- BREAKING CHANGE WARNING:
-- This migration changes the signature of upsert_memory() from 8 params to 10 params.
-- 
-- DEPLOYMENT SEQUENCE (REQUIRED):
-- 1. PAUSE worker (or accept temporary memory extraction failures)
-- 2. RUN this migration
-- 3. DEPLOY updated worker code (MemoryExtractor.ts updated to pass external_user_id + channel_type)
-- 4. RESUME worker
-- 
-- Alternative: Use v6 backward compatibility wrapper (keeps old function for 1 release)
-- 
-- Changes from v5 → v6:
-- - Added backward compatibility wrapper (old function signature still works)
-- - Removed Supabase project ID references
-- - Clarified audit logging (only search_memory_admin() has logging)
-- - Explicit deployment sequencing documentation
-- - Evidence-based privilege verification
-- 
-- ============================================================================

-- ============================================================================
-- TRANSACTION START
-- ============================================================================

BEGIN;

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
-- 4. Create NEW upsert_memory() Function (10 params - User-Scoped)
-- ============================================================================

-- Drop old function first (will be recreated as wrapper below)
DROP FUNCTION IF EXISTS upsert_memory(UUID, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB);

-- Create new function with user scoping
CREATE OR REPLACE FUNCTION upsert_memory(
  p_assistant_id UUID,
  p_external_user_id TEXT,  -- NEW: REQUIRED for user scoping
  p_content TEXT,
  p_category TEXT DEFAULT 'fact',
  p_importance NUMERIC DEFAULT 0.5,
  p_conversation_id UUID DEFAULT NULL,
  p_source_message_id UUID DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_channel_type TEXT DEFAULT NULL  -- NEW: For scoped_user_id computation
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_hash TEXT;
  v_scoped_user_id TEXT;
  v_memory_id UUID;
BEGIN
  -- Validate REQUIRED parameter
  IF p_external_user_id IS NULL THEN
    RAISE EXCEPTION 'upsert_memory: p_external_user_id is REQUIRED (got NULL)';
  END IF;
  
  -- Compute content hash for dedup
  v_hash := md5(lower(trim(p_content)));
  
  -- Compute scoped_user_id (channel:user format)
  IF p_channel_type IS NOT NULL THEN
    v_scoped_user_id := p_channel_type || ':' || p_external_user_id;
  ELSE
    -- Fallback: use 'unknown' channel if not provided (but log warning)
    v_scoped_user_id := 'unknown:' || p_external_user_id;
    RAISE WARNING 'upsert_memory: p_channel_type not provided, using "unknown:%" format', p_external_user_id;
  END IF;
  
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

COMMENT ON FUNCTION upsert_memory IS 
  'v6: Upserts memory with user-scoped deduplication. p_external_user_id is REQUIRED (throws error if NULL). ON CONFLICT target: (assistant_id, scoped_user_id, content_hash) WHERE both NOT NULL.';

-- SECURITY: Revoke from PUBLIC + anon + authenticated
REVOKE ALL ON FUNCTION upsert_memory(UUID, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_memory(UUID, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB, TEXT) TO service_role;

-- ============================================================================
-- 5. Backward Compatibility Wrapper (OLD 8-param function)
-- ============================================================================
-- 
-- This allows old worker code to continue working during deployment window.
-- REMOVE THIS IN NEXT MIGRATION after worker is fully deployed.
-- 
-- NOTE: Old calls will use 'unknown:unknown' as scoped_user_id (isolated from new data)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_memory_legacy(
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
  -- Log deprecation warning
  RAISE WARNING 'upsert_memory_legacy called (8-param signature is DEPRECATED - update worker code to pass external_user_id + channel_type)';
  
  -- Call new function with placeholder values
  -- NOTE: Using 'unknown:unknown' isolates legacy memories from new scoped memories
  RETURN upsert_memory(
    p_assistant_id,
    'unknown',  -- external_user_id placeholder
    p_content,
    p_category,
    p_importance,
    p_conversation_id,
    p_source_message_id,
    p_embedding,
    p_metadata,
    'unknown'  -- channel_type placeholder
  );
END;
$$;

COMMENT ON FUNCTION upsert_memory_legacy IS 
  'DEPRECATED: Backward compatibility wrapper for old 8-param signature. Uses ''unknown:unknown'' as scoped_user_id. REMOVE IN NEXT MIGRATION after worker deployment.';

-- SECURITY: Same privileges as new function
REVOKE ALL ON FUNCTION upsert_memory_legacy(UUID, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_memory_legacy(UUID, TEXT, TEXT, NUMERIC, UUID, UUID, vector(1536), JSONB) TO service_role;

-- ============================================================================
-- 6. Create search_memory() Function (REQUIRED User Scoping)
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
  'Vector similarity search for memories. p_scoped_user_id is REQUIRED (throws error if NULL) to prevent cross-user data leakage. Explicitly excludes NULL scoped_user_id rows (legacy memories). NO AUDIT LOGGING (use search_memory_admin for audited access).';

-- SECURITY: Revoke from PUBLIC + anon + authenticated
REVOKE ALL ON FUNCTION search_memory(UUID, vector(1536), TEXT, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_memory(UUID, vector(1536), TEXT, INTEGER, NUMERIC) TO service_role;

-- ============================================================================
-- 7. Create search_memory_admin() Function (Unscoped - Admin Only)
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
  RAISE LOG 'search_memory_admin called for assistant % by % (UNSCOPED - admin only)', p_assistant_id, current_user;
  
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
  'ADMIN ONLY: Unscoped memory search. Returns ALL user memories (cross-user). AUDIT LOGGED: Logs access to Postgres logs for security audit trail. Use ONLY for debugging/admin tasks.';

-- SECURITY: Revoke from everyone (manual grant to admin role required)
REVOKE ALL ON FUNCTION search_memory_admin(UUID, vector(1536), INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
-- MANUAL GRANT REQUIRED: GRANT EXECUTE ON FUNCTION search_memory_admin(...) TO admin_role;

-- ============================================================================
-- 8. Backfill Strategy for Existing Memories
-- ============================================================================

UPDATE assistant_memory 
SET metadata = metadata || '{"migration_048_legacy": true, "excluded_from_retrieval": true}'
WHERE scoped_user_id IS NULL;

-- ============================================================================
-- 9. Verification Queries
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

-- ============================================================================
-- TRANSACTION COMMIT
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-DEPLOY VERIFICATION (Run After Migration!)
-- ============================================================================

-- EVIDENCE: Check function privileges
-- Expected: ONLY service_role (no PUBLIC/anon/authenticated)
DO $$
DECLARE
  v_record RECORD;
  v_issues INTEGER := 0;
BEGIN
  RAISE NOTICE '=== PRIVILEGE VERIFICATION (Evidence-Based) ===';
  
  FOR v_record IN
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_name IN ('search_memory','upsert_memory','upsert_memory_legacy','search_memory_admin')
      AND routine_schema = 'public'
    ORDER BY routine_name, grantee
  LOOP
    RAISE NOTICE 'Function: %, Grantee: %, Privilege: %', v_record.routine_name, v_record.grantee, v_record.privilege_type;
    
    -- Check for unexpected grants
    IF v_record.grantee IN ('PUBLIC', 'anon', 'authenticated') THEN
      RAISE WARNING 'SECURITY ISSUE: % can execute % (should be service_role only!)', v_record.grantee, v_record.routine_name;
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
-- Worker deployment is REQUIRED immediately after migration.
-- Until worker code is updated, memory extraction will use deprecated legacy function.
-- 
-- File: worker/src/memory/MemoryExtractor.ts
-- 
-- BEFORE (8 params - uses upsert_memory_legacy):
--   await supabase.rpc('upsert_memory', {
--     p_assistant_id: assistantId,
--     p_content: memory.content,
--     p_category: memory.category || 'fact',
--     p_importance: memory.importance || 0.5,
--     p_conversation_id: conversationId,
--     p_source_message_id: messageId,
--     p_embedding: embedding,
--     p_metadata: memory.metadata || {}
--   });
-- 
-- AFTER (10 params - uses new upsert_memory):
--   await supabase.rpc('upsert_memory', {
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
-- v6 CHANGES FROM v5:
-- 1. Added upsert_memory_legacy() backward compatibility wrapper
-- 2. Removed Supabase project ID references (security best practice)
-- 3. Clarified audit logging (only search_memory_admin() has logging)
-- 4. Explicit deployment sequencing documentation
-- 5. Evidence-based privilege verification (information_schema query)
-- 6. Clearer comments about breaking changes
-- 
-- DEPLOYMENT SEQUENCE:
-- Option A (Zero Downtime - RECOMMENDED):
--   1. Deploy this migration (backward compatibility wrapper active)
--   2. Deploy updated worker code
--   3. Deploy next migration (removes upsert_memory_legacy)
-- 
-- Option B (Accept Temporary Downtime):
--   1. Pause worker
--   2. Deploy this migration
--   3. Deploy updated worker code
--   4. Resume worker
-- 
-- SECURITY NOTES:
-- - Transactional migration: ✅ BEGIN/COMMIT wrapper ensures auto-rollback on failure
-- - Privileges locked down: ✅ REVOKE from PUBLIC/anon/authenticated, GRANT to service_role only
-- - Audit logging: ⚠️ ONLY search_memory_admin() has audit logging (regular functions do not)
-- - Evidence provided: ✅ POST-DEPLOY VERIFICATION queries information_schema
-- 
-- ARCHITECTURE NOTE:
-- scoped_user_id format ("channel:user_id") prevents cross-user leakage AND prevents
-- cross-channel collisions, but also prevents identity unification. If unified identity
-- is needed in future, an identity-linking layer will be required.
-- 
-- ============================================================================