-- Fix: Add index for get_recent_memories_v2() RPC
-- Matches exact WHERE + ORDER BY: assistant_id = $1 AND scoped_user_id = $2 ORDER BY last_accessed_at DESC NULLS LAST
-- Without this index, every memory load does a full table scan.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memory_assistant_scoped_accessed
  ON assistant_memory (assistant_id, scoped_user_id, last_accessed_at DESC NULLS LAST);
