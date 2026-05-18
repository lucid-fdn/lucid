-- ============================================================================
-- Migration 048: Memory User-Scoped Deduplication (CRITICAL FIX)
-- ============================================================================
-- 
-- Purpose: Fix cross-user memory data leakage bug in migration 045
-- 
-- PROBLEM:
-- Migration 045 creates memory dedup index by (assistant_id, content_hash) ONLY.
-- This causes cross-user data leakage:
--   User A: "My favorite color is blue" → hash=abc123
--   User B: "My favorite color is blue" → hash=abc123 → COLLISION!
--   User B might see User A's memories (privacy violation!)
-- 
-- FIX:
-- Add external_user_id to dedup index for user-scoped deduplication:
--   (assistant_id, external_user_id, content_hash)
-- 
-- This ensures memories are unique PER USER, not globally per assistant.
-- 
-- Priority: 🔴 CRITICAL - Data Leakage Risk
-- ============================================================================

-- ============================================================================
-- 1. Drop Old Broken Index
-- ============================================================================

DROP INDEX IF EXISTS idx_memory_content_hash;

COMMENT ON TABLE assistant_memory IS 
  'Stores extracted memories (facts, preferences, context) with user-scoped deduplication. Index: (assistant_id, external_user_id, content_hash) prevents cross-user leakage.';

-- ============================================================================
-- 2. Create User-Scoped Dedup Index
-- ============================================================================

CREATE UNIQUE INDEX idx_memory_unique_content
  ON assistant_memory(assistant_id, external_user_id, content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON INDEX idx_memory_unique_content IS 
  'User-scoped memory deduplication. Prevents cross-user data leakage by including external_user_id. Same memory content from different users = different memory records.';

-- ============================================================================
-- 3. Update upsert_memory() Function
-- ============================================================================

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
    assistant_id, 
    external_user_id, 
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
    p_content, 
    v_hash,
    p_embedding, 
    p_category, 
    p_importance, 
    p_source_message_id, 
    p_metadata, 
    p_conversation_id
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

COMMENT ON FUNCTION upsert_memory IS 
  'Upserts memory with user-scoped deduplication. ON CONFLICT target: (assistant_id, external_user_id, content_hash). If duplicate memory for SAME USER, updates importance (max) and refreshes last_accessed_at. Different users can have same memory content without collision.';

GRANT EXECUTE ON FUNCTION upsert_memory TO service_role;

-- ============================================================================
-- 4. Verification Queries
-- ============================================================================

-- Verify new index exists
DO $$
DECLARE
  v_index_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_memory_unique_content'
  ) INTO v_index_exists;
  
  IF v_index_exists THEN
    RAISE NOTICE 'SUCCESS: idx_memory_unique_content created';
  ELSE
    RAISE EXCEPTION 'FAILED: idx_memory_unique_content not found';
  END IF;
END $$;

-- Verify old index removed
DO $$
DECLARE
  v_old_index_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_memory_content_hash'
  ) INTO v_old_index_exists;
  
  IF NOT v_old_index_exists THEN
    RAISE NOTICE 'SUCCESS: Old idx_memory_content_hash removed';
  ELSE
    RAISE WARNING 'Old idx_memory_content_hash still exists (should be dropped)';
  END IF;
END $$;

-- Check for existing duplicate memories (cross-user)
DO $$
DECLARE
  v_duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT assistant_id, content_hash, COUNT(*) as cnt
    FROM assistant_memory
    WHERE content_hash IS NOT NULL
    GROUP BY assistant_id, content_hash
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF v_duplicate_count > 0 THEN
    RAISE WARNING 'Found % sets of duplicate memories (cross-user). This is expected if users share common facts. After this migration, new memories will be user-scoped.', v_duplicate_count;
  ELSE
    RAISE NOTICE 'No duplicate memories found (cross-user)';
  END IF;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================

-- BEFORE (Migration 045 - BROKEN):
-- - Index: (assistant_id, content_hash)
-- - User A: "Blue" → hash=abc123 → memory_1
-- - User B: "Blue" → hash=abc123 → CONFLICT (merged with User A's memory!)
-- - Result: Cross-user data leakage
--
-- AFTER (Migration 048 - FIXED):
-- - Index: (assistant_id, external_user_id, content_hash)
-- - User A: "Blue" → hash=abc123 → memory_1 (for User A)
-- - User B: "Blue" → hash=abc123 → memory_2 (for User B)
-- - Result: User-scoped memories, no leakage
--
-- NEXT STEPS:
-- 1. Verify migration success (see queries above)
-- 2. Update worker code to pass external_user_id to upsert_memory()
-- 3. Monitor production for constraint violations
-- 4. Run dedup verification query (see MIGRATION_047_NEXT_STEPS.md)
--
-- ============================================================================