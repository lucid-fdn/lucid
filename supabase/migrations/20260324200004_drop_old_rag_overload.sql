-- Drop the old 5-param match_rag_chunks overload that doesn't support system scope.
-- Only the 6-param version (with match_query) should exist.

-- Guard: skip if RAG tables don't exist (self-hosted mode)
-- DROP FUNCTION IF EXISTS is already safe, but the function references rag types
-- so we guard to avoid noise
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rag_chunks'
  ) THEN
    RAISE NOTICE 'Skipping 20260324200004_drop_old_rag_overload: rag_chunks table does not exist';
    RETURN;
  END IF;

  DROP FUNCTION IF EXISTS match_rag_chunks(VECTOR(1536), UUID, UUID, FLOAT, INT);
END;
$guard$;
