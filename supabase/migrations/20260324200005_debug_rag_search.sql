-- Debug: recreate match_rag_chunks as a single simple function

-- Guard: skip entire migration if RAG tables don't exist (self-hosted mode)
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rag_chunks'
  ) THEN
    RAISE NOTICE 'Skipping 20260324200005_debug_rag_search: rag_chunks table does not exist';
    RETURN;
  END IF;

  EXECUTE 'DROP FUNCTION IF EXISTS match_rag_chunks(VECTOR(1536), UUID, UUID, FLOAT, INT, TEXT)';

  EXECUTE $fn$
CREATE FUNCTION match_rag_chunks(
  query_embedding VECTOR(1536),
  match_org_id UUID,
  match_project_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5,
  match_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INT,
  similarity FLOAT,
  metadata JSONB,
  document_title TEXT,
  source_type TEXT,
  section_heading TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  -- Pure vector search — searches org + system scope chunks
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity,
    c.metadata,
    d.title AS document_title,
    d.source_type,
    (c.metadata->>'section_heading')::TEXT AS section_heading
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  WHERE (c.org_id = match_org_id OR c.scope = 'system')
    AND (match_project_id IS NULL OR c.project_id = match_project_id)
    AND d.status = 'ready'
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding))::FLOAT > match_threshold
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$body$;
  $fn$;

END;
$guard$;
