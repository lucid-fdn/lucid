-- ============================================================================
-- Migration 048 v2: Memory User-Scoped Deduplication (SAFE VERSION)
-- ============================================================================
-- 
-- Purpose: Fix cross-user memory data leakage bug in migration 045
-- 
-- PROBLEM (CONFIRMED via code inspection):
-- 1. upsert_memory() deduplicates by (assistant_id, content_hash) ONLY
--    → User A and User B with same content → MERGED into ONE memory
-- 2. Memory retrieval filters by assistant_id ONLY (no user scoping)
--    → User B retrieves User A's memories → TRUE DATA LEAKAGE!
-- 
-- FIX:
-- 1. Add external_user_id column (doesn't exist yet!)
-- 2. Use scoped_user_id for multi-channel support
-- 3. PARTIAL unique index (handles existing NULL values safely)
-- 4. Update upsert_memory() and search_memory() functions
-- 
-- Priority: 🔴 CRITICAL - Confirmed Data Leakage (not just bad dedupe)
-- ============================================================================

-- ============================================================================
-- 1. Add Missing Columns
-- ============================================================================

-- Add external_user_id (from assistant_inbound_events)
ALTER TABLE assistant_memory 
  ADD COLUMN IF NOT EXISTS external_user_id TEXT;

COMMENT ON COLUMN assistant_memory.external_user_id IS 
  'User identifier from the channel (Telegram user_id, WhatsApp phone, etc.)';

-- Add scoped_user_id (computed column for multi-channel safety)
-- Format: "telegram:123456" or "whatsapp:+1234567890"
-- This prevents collision between Telegram user_id "123" and WhatsApp phone "+123"
ALTER TABLE assistant_memory 
  ADD COLUMN IF NOT EXISTS scoped_user_id TEXT;

COMMENT ON COLUMN assistant_memory.scoped_user_id IS 
  'Channel-scoped user ID (format: channel_type:external_user_id). Prevents cross-channel collisions.';

-- ============================================================================
-- 2. Drop Old Broken Index
-- ============================================================================

DROP INDEX IF EXISTS idx_memory_content_hash;

-- ============================================================================
-- 3. Create User-Scoped Dedup Index (PARTIAL - Handles NULL Safely!)
-- ============================================================================

-- CRITICAL: Use WHERE clause to handle existing NULL values
-- Without WHERE: Postgres allows multiple (uuid, NULL, text) rows (NULL ≠ NULL)
-- With WHERE: Only non-NULL scoped_user_id participates in uniqueness check
CREATE UNIQUE INDEX idx_memory_unique_content_scoped
  ON assistant_memory(assistant_id, scoped_user_id, content_hash)
  WHERE scoped_user_id IS NOT NULL AND content_hash IS NOT NULL;

COMMENT ON INDEX idx_memory_unique_content_scoped IS 
  'User-scoped memory deduplication (PARTIAL index handles NULL safely). Format: (assistant_id, channel:user_id, hash).';

-- ============================================================================
-- 4. Update upsert_memory() Function (User-Scoped Version)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_memory(
  p_assistant_id UUID,
  p_external_user_id TEXT,  -- NEW: Required for user scoping
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
  -- Compute content hash for dedup
  v_hash := md5(lower(trim(p_content)));
  
  -- Compute scoped_user_id (channel:user format)
  IF p_channel_type IS NOT NULL AND p_external_user_id IS NOT NULL THEN
    v_scoped_user_id := p_channel_type || ':' || p_external_user_id;
  ELSIF p_external_user_id IS NOT NULL THEN
    -- Fallback: use raw external_user_id if channel_type not provided
    v_scoped_user_id := 'unknown:' || p_external_user_id;
  ELSE
    -- NULL user_id → no scoping (legacy behavior, but logged)
    v_scoped_user_id := NULL;
    RAISE WARNING 'upsert_memory called without external_user_id - memory will not be deduplicated!';
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
  'Upserts memory with user-scoped deduplication. Requires external_user_id for proper scoping. ON CONFLICT target: (assistant_id, scoped_user_id, content_hash) WHERE both NOT NULL.';

GRANT EXECUTE ON FUNCTION upsert_memory TO service_role;

-- ============================================================================
-- 5. Update search_memory() Function (Add User Scoping Option)
-- ============================================================================

-- NOTE: The existing search_memory() doesn't exist yet, so create it with user scoping
CREATE OR REPLACE FUNCTION search_memory(
  p_assistant_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_threshold NUMERIC DEFAULT 0.7,
  p_scoped_user_id TEXT DEFAULT NULL  -- NEW: Optional user scoping
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
    -- Optional user scoping (if provided)
    AND (p_scoped_user_id IS NULL OR m.scoped_user_id = p_scoped_user_id)
    -- Similarity threshold
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY m.embedding <=> p_query_embedding ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION search_memory IS 
  'Vector similarity search for memories. Optional p_scoped_user_id parameter enables user-scoped retrieval (prevents cross-user leakage).';

GRANT EXECUTE ON FUNCTION search_memory TO service_role;

-- ============================================================================
-- 6. Backfill Strategy for Existing Memories
-- ============================================================================

-- DECISION POINT: How to handle existing memories with NULL external_user_id?
--
-- OPTION A: Mark for cleanup (recommended for production with real user data)
-- UPDATE assistant_memory SET metadata = metadata || '{"migration_048_orphan": true}'
-- WHERE external_user_id IS NULL;
--
-- OPTION B: Delete orphaned memories (if no critical data)
-- DELETE FROM assistant_memory WHERE external_user_id IS NULL;
--
-- OPTION C: Leave as-is (they won't participate in dedup, which is safer than cross-user merge)
-- (No action needed - partial index handles this)
--
-- For now: Leave as-is (Option C). Worker code will start writing scoped memories.
-- Old memories without scoped_user_id will gradually age out or be explicitly cleaned.

-- ============================================================================
-- 7. Verification Queries
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
  v_index_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_memory_unique_content_scoped'
  ) INTO v_index_exists;
  
  IF v_index_exists THEN
    RAISE NOTICE 'SUCCESS: idx_memory_unique_content_scoped created (PARTIAL index)';
  ELSE
    RAISE EXCEPTION 'FAILED: idx_memory_unique_content_scoped not found';
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

-- Check for existing memories without scoped_user_id
DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM assistant_memory
  WHERE scoped_user_id IS NULL;
  
  IF v_null_count > 0 THEN
    RAISE NOTICE 'Found % memories with NULL scoped_user_id (will not participate in dedup - safe)', v_null_count;
  ELSE
    RAISE NOTICE 'All memories have scoped_user_id';
  END IF;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================

-- BEFORE (Migration 045 - BROKEN):
-- - upsert_memory: Dedup by (assistant_id, content_hash) ONLY
-- - search_memory: Filters by assistant_id ONLY
-- - User A: "Blue" → memory_1
-- - User B: "Blue" → MERGED with memory_1 (collision!)
-- - User B retrieves → SEES User A's memory (DATA LEAKAGE!)
--
-- AFTER (Migration 048 v2 - FIXED):
-- - upsert_memory: Dedup by (assistant_id, scoped_user_id, content_hash)
-- - search_memory: Optional user scoping via p_scoped_user_id
-- - User A (Telegram): "Blue" → memory_1 (telegram:user_a)
-- - User B (WhatsApp): "Blue" → memory_2 (whatsapp:user_b)
-- - User B retrieves with scoping → ONLY sees own memories (NO LEAKAGE!)
--
-- SAFETY FEATURES:
-- 1. PARTIAL index: WHERE scoped_user_id IS NOT NULL (handles NULL safely)
-- 2. scoped_user_id format: "channel:user_id" (prevents cross-channel collisions)
-- 3. Existing NULL memories: Don't participate in dedup (safer than cross-user merge)
-- 4. Warnings logged when upsert_memory called without external_user_id
--
-- NEXT STEPS:
-- 1. Deploy this migration (adds columns + indexes + functions)
-- 2. Update worker code: Pass external_user_id + channel_type to upsert_memory()
-- 3. Update MemoryRetriever.ts: Pass scoped_user_id to search_memory()
-- 4. Monitor for NULL external_user_id warnings
-- 5. Clean up orphaned memories (optional)
--
-- ============================================================================