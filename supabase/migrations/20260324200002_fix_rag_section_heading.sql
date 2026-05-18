-- Fix: rag_chunks has no section_heading column — read from metadata instead

-- Guard: skip entire migration if RAG tables don't exist (self-hosted mode)
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rag_chunks'
  ) THEN
    RAISE NOTICE 'Skipping 20260324200002_fix_rag_section_heading: rag_chunks table does not exist';
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION match_rag_chunks(
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
DECLARE
  k CONSTANT INT := 60;
BEGIN
  IF match_query IS NOT NULL AND match_query <> '' THEN
    RETURN QUERY
    WITH vector_results AS (
      SELECT
        c.id,
        c.document_id,
        c.content,
        c.chunk_index,
        1 - (c.embedding <=> query_embedding) AS vec_similarity,
        c.metadata,
        (c.metadata->>'section_heading')::TEXT AS section_heading,
        d.title AS document_title,
        d.source_type,
        ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding ASC) AS vec_rank
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE (c.org_id = match_org_id OR c.scope = 'system')
        AND (match_project_id IS NULL OR c.project_id = match_project_id)
        AND d.status = 'ready'
        AND c.embedding IS NOT NULL
        AND 1 - (c.embedding <=> query_embedding) > match_threshold
      ORDER BY c.embedding <=> query_embedding ASC
      LIMIT match_count * 3
    ),
    fts_results AS (
      SELECT
        c.id,
        c.document_id,
        c.content,
        c.chunk_index,
        ts_rank_cd(c.fts, websearch_to_tsquery('english', match_query)) AS fts_score,
        c.metadata,
        (c.metadata->>'section_heading')::TEXT AS section_heading,
        d.title AS document_title,
        d.source_type,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('english', match_query)) DESC
        ) AS fts_rank
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE (c.org_id = match_org_id OR c.scope = 'system')
        AND (match_project_id IS NULL OR c.project_id = match_project_id)
        AND d.status = 'ready'
        AND c.fts @@ websearch_to_tsquery('english', match_query)
      ORDER BY fts_score DESC
      LIMIT match_count * 3
    ),
    combined AS (
      SELECT
        COALESCE(v.id, f.id) AS id,
        COALESCE(v.document_id, f.document_id) AS document_id,
        COALESCE(v.content, f.content) AS content,
        COALESCE(v.chunk_index, f.chunk_index) AS chunk_index,
        COALESCE(v.vec_similarity, 0) AS similarity,
        COALESCE(v.metadata, f.metadata) AS metadata,
        COALESCE(v.document_title, f.document_title) AS document_title,
        COALESCE(v.source_type, f.source_type) AS source_type,
        COALESCE(v.section_heading, f.section_heading) AS section_heading,
        COALESCE(1.0 / (k + v.vec_rank), 0) +
        COALESCE(1.0 / (k + f.fts_rank), 0) AS rrf_score
      FROM vector_results v
      FULL OUTER JOIN fts_results f ON v.id = f.id
    )
    SELECT
      combined.id,
      combined.document_id,
      combined.content,
      combined.chunk_index,
      combined.similarity::FLOAT,
      combined.metadata,
      combined.document_title,
      combined.source_type,
      combined.section_heading
    FROM combined
    ORDER BY combined.rrf_score DESC
    LIMIT match_count;
  ELSE
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
      AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count;
  END IF;
END;
$body$;
  $fn$;

END;
$guard$;
