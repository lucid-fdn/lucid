-- ============================================================================
-- Migration 099: RAG Hybrid Search + Contextual Embeddings Support
-- ============================================================================
-- Adds full-text search (tsvector) to rag_chunks for hybrid retrieval.
-- Combines vector similarity (semantic) + keyword matching (lexical) via RRF.
--
-- Also adds section_heading column for contextual embedding metadata.
--
-- Dependencies: Migration 049 (rag_knowledge_base)
-- ============================================================================

-- Guard: skip entire migration if RAG tables don't exist (self-hosted mode)
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rag_chunks'
  ) THEN
    RAISE NOTICE 'Skipping 20260324190000_rag_hybrid_search: rag_chunks table does not exist';
    RETURN;
  END IF;

  -- 1. Add tsvector column for full-text search
  EXECUTE 'ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (to_tsvector(''english'', content)) STORED';

  -- 2. Add section_heading for contextual embedding metadata
  EXECUTE 'ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS section_heading TEXT';

  -- 3. GIN index for full-text search (fast keyword matching)
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rag_chunks_fts ON rag_chunks USING gin(fts)';

  -- 4. Replace match_rag_chunks with hybrid search (vector + FTS + RRF)
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION match_rag_chunks(
  query_embedding VECTOR(1536),
  match_org_id UUID,
  match_project_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5,
  match_query TEXT DEFAULT NULL  -- Optional: keyword query for hybrid search
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
  k CONSTANT INT := 60;  -- RRF constant (standard value)
BEGIN
  IF match_query IS NOT NULL AND match_query <> '' THEN
    -- Hybrid search: combine vector similarity + full-text search via RRF
    RETURN QUERY
    WITH vector_results AS (
      SELECT
        c.id,
        c.document_id,
        c.content,
        c.chunk_index,
        1 - (c.embedding <=> query_embedding) AS vec_similarity,
        c.metadata,
        c.section_heading,
        d.title AS document_title,
        d.source_type,
        ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding ASC) AS vec_rank
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE c.org_id = match_org_id
        AND (match_project_id IS NULL OR c.project_id = match_project_id)
        AND d.status = 'ready'
        AND c.embedding IS NOT NULL
        AND 1 - (c.embedding <=> query_embedding) > match_threshold
      ORDER BY c.embedding <=> query_embedding ASC
      LIMIT match_count * 3  -- Over-fetch for RRF merge
    ),
    fts_results AS (
      SELECT
        c.id,
        c.document_id,
        c.content,
        c.chunk_index,
        ts_rank_cd(c.fts, websearch_to_tsquery('english', match_query)) AS fts_score,
        c.metadata,
        c.section_heading,
        d.title AS document_title,
        d.source_type,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('english', match_query)) DESC
        ) AS fts_rank
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE c.org_id = match_org_id
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
        -- Reciprocal Rank Fusion (RRF) score
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
    -- Pure vector search (backward compatible)
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
      c.section_heading
    FROM rag_chunks c
    JOIN rag_documents d ON d.id = c.document_id
    WHERE c.org_id = match_org_id
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

  EXECUTE 'COMMENT ON FUNCTION match_rag_chunks(VECTOR(1536), UUID, UUID, FLOAT, INT, TEXT) IS ''Hybrid RAG search: vector similarity + full-text keyword matching via Reciprocal Rank Fusion (RRF). Falls back to pure vector search when no keyword query provided.''';

END;
$guard$;
