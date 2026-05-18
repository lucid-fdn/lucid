-- ============================================================================
-- Migration 045: Streaming, Memory Extraction & Model Routing
-- 
-- Adds columns needed for Sprint 1-3 of Lucid Personal:
-- 1. stream_mode on ai_assistants (controls streaming behavior per channel)
-- 2. Memory extraction model config
-- 3. Content hash on memory for deduplication
-- 4. Model routing/fallback config
-- 5. Usage tracking enhancements
-- ============================================================================

-- ============================================================================
-- 1. STREAMING CONFIGURATION
-- ============================================================================

-- Add stream_mode to ai_assistants
-- Controls how responses are delivered to channels:
-- 'auto' = stream for Telegram, ack-if-slow for WhatsApp, queue for web
-- 'stream' = always stream (edit-in-place where supported)
-- 'queue' = always use outbound event queue (legacy behavior)
-- NULL = 'auto' (default)
ALTER TABLE ai_assistants 
  ADD COLUMN IF NOT EXISTS stream_mode TEXT 
  CHECK (stream_mode IN ('auto', 'stream', 'queue'));

COMMENT ON COLUMN ai_assistants.stream_mode IS 
  'Controls response delivery: auto (default), stream (edit-in-place), queue (outbound events)';

-- ============================================================================
-- 2. MEMORY EXTRACTION CONFIGURATION
-- ============================================================================

-- Model to use for memory extraction (smaller/cheaper model)
ALTER TABLE ai_assistants 
  ADD COLUMN IF NOT EXISTS memory_extraction_model TEXT DEFAULT 'gpt-4o-mini';

-- Memory extraction strategy
ALTER TABLE ai_assistants 
  ADD COLUMN IF NOT EXISTS memory_strategy TEXT DEFAULT 'auto'
  CHECK (memory_strategy IN ('auto', 'aggressive', 'conservative', 'off'));

COMMENT ON COLUMN ai_assistants.memory_extraction_model IS 
  'Model used for memory fact extraction (cheaper model recommended)';
COMMENT ON COLUMN ai_assistants.memory_strategy IS 
  'How aggressively to extract memories: auto, aggressive, conservative, off';

-- ============================================================================
-- 3. MEMORY DEDUPLICATION
-- ============================================================================

-- Add content hash for fast deduplication check
ALTER TABLE assistant_memory 
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Index for dedup lookups
CREATE INDEX IF NOT EXISTS idx_memory_content_hash 
  ON assistant_memory(assistant_id, content_hash) 
  WHERE content_hash IS NOT NULL;

-- Backfill hash for existing memories
UPDATE assistant_memory 
SET content_hash = md5(lower(trim(content)))
WHERE content_hash IS NULL;

-- Add a metadata column for extraction provenance
ALTER TABLE assistant_memory 
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN assistant_memory.content_hash IS 
  'MD5 hash of normalized content for deduplication';
COMMENT ON COLUMN assistant_memory.metadata IS 
  'Extraction metadata: source_turn, extraction_model, confidence, etc.';

-- ============================================================================
-- 4. MODEL ROUTING / FALLBACK
-- ============================================================================

-- Fallback model if primary model is unavailable
ALTER TABLE ai_assistants 
  ADD COLUMN IF NOT EXISTS fallback_model TEXT;

-- Model provider preference (for Lucid-L2 routing)
ALTER TABLE ai_assistants 
  ADD COLUMN IF NOT EXISTS model_routing_strategy TEXT DEFAULT 'default'
  CHECK (model_routing_strategy IN ('default', 'cost_optimized', 'latency_optimized', 'quality_first'));

COMMENT ON COLUMN ai_assistants.fallback_model IS 
  'Fallback model if lucid_model is unavailable (e.g., gpt-4o-mini)';
COMMENT ON COLUMN ai_assistants.model_routing_strategy IS 
  'Lucid-L2 routing preference: default, cost_optimized, latency_optimized, quality_first';

-- ============================================================================
-- 5. USAGE TRACKING ENHANCEMENTS
-- ============================================================================

-- Add cost tracking to messages
ALTER TABLE assistant_messages 
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6);

-- Add model used (may differ from assistant config due to fallback)
ALTER TABLE assistant_messages 
  ADD COLUMN IF NOT EXISTS model_used TEXT;

-- Add latency tracking
ALTER TABLE assistant_messages 
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

COMMENT ON COLUMN assistant_messages.cost_usd IS 'Estimated cost in USD for this message';
COMMENT ON COLUMN assistant_messages.model_used IS 'Actual model used (may differ from config due to fallback)';
COMMENT ON COLUMN assistant_messages.latency_ms IS 'End-to-end latency in milliseconds';

-- ============================================================================
-- 6. HELPER FUNCTION: Upsert memory with dedup
-- ============================================================================

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
DECLARE
  v_hash TEXT;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- Compute content hash for dedup
  v_hash := md5(lower(trim(p_content)));
  
  -- Check for existing memory with same hash
  SELECT id INTO v_existing_id
  FROM assistant_memory
  WHERE assistant_id = p_assistant_id
    AND content_hash = v_hash;
  
  IF FOUND THEN
    -- Update importance if new is higher, refresh last_accessed_at
    UPDATE assistant_memory
    SET 
      importance = GREATEST(importance, p_importance),
      last_accessed_at = NOW(),
      metadata = COALESCE(metadata, '{}') || p_metadata
    WHERE id = v_existing_id;
    
    RETURN v_existing_id;
  ELSE
    -- Insert new memory
    INSERT INTO assistant_memory (
      assistant_id, conversation_id, content, content_hash, 
      embedding, category, importance, source_message_id, metadata
    ) VALUES (
      p_assistant_id, p_conversation_id, p_content, v_hash,
      p_embedding, p_category, p_importance, p_source_message_id, p_metadata
    )
    RETURNING id INTO v_new_id;
    
    RETURN v_new_id;
  END IF;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION upsert_memory TO service_role;

-- ============================================================================
-- Done!
-- 
-- Summary of changes:
-- - ai_assistants: +stream_mode, +memory_extraction_model, +memory_strategy,
--                  +fallback_model, +model_routing_strategy
-- - assistant_memory: +content_hash (with dedup index), +metadata
-- - assistant_messages: +cost_usd, +model_used, +latency_ms
-- - New function: upsert_memory (insert-or-update with content hash dedup)
-- ============================================================================