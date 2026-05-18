-- ============================================================================
-- Assistant memory access counters
-- ============================================================================
-- Some assistant detail surfaces read assistant_memory.access_count, but older
-- production databases only have last_accessed_at. Add the counter with a safe
-- default so reads and future ranking logic are consistent.

ALTER TABLE assistant_memory
ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN assistant_memory.access_count IS
  'Approximate number of retrieval/access events for this memory row.';
