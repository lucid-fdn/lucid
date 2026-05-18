-- ============================================================================
-- Migration 100: RAG System-Scope Documents (Global Platform Docs)
-- ============================================================================
-- Adds a `scope` column to rag_documents and rag_chunks so documents can be
-- either org-scoped ('org') or system-wide ('system').
--
-- System docs are inserted once by the platform and are visible to ALL orgs
-- during retrieval. This avoids duplicating platform documentation into every
-- org's knowledge base.
--
-- Changes:
--   1. Add scope column to rag_documents + rag_chunks
--   2. Make org_id nullable (system docs have no org)
--   3. Update match_rag_chunks RPC to search both org + system chunks
--   4. Add RLS policy for system doc visibility
--
-- Dependencies: Migration 049, 099
-- ============================================================================

-- 1. Add scope column (defaults to 'org' — backward compatible)
ALTER TABLE rag_documents
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'org'
  CHECK (scope IN ('org', 'system'));

ALTER TABLE rag_chunks
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'org'
  CHECK (scope IN ('org', 'system'));

-- 2. Make org_id nullable for system docs
ALTER TABLE rag_documents ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE rag_chunks ALTER COLUMN org_id DROP NOT NULL;

-- 3. Ensure system docs have no org_id and org docs always have one
ALTER TABLE rag_documents
  ADD CONSTRAINT rag_documents_scope_org_check
  CHECK (
    (scope = 'system' AND org_id IS NULL)
    OR (scope = 'org' AND org_id IS NOT NULL)
  );

ALTER TABLE rag_chunks
  ADD CONSTRAINT rag_chunks_scope_org_check
  CHECK (
    (scope = 'system' AND org_id IS NULL)
    OR (scope = 'org' AND org_id IS NOT NULL)
  );

-- 4. Index for fast system doc lookup
CREATE INDEX IF NOT EXISTS idx_rag_documents_scope ON rag_documents(scope);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_scope ON rag_chunks(scope);

-- 5. RLS: all authenticated users can read system docs
CREATE POLICY "All users see system documents"
  ON rag_documents FOR SELECT
  TO authenticated
  USING (scope = 'system');

CREATE POLICY "All users see system chunks"
  ON rag_chunks FOR SELECT
  TO authenticated
  USING (scope = 'system');

-- 6. Update match_rag_chunks to search org + system chunks
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
AS $$
DECLARE
  k CONSTANT INT := 60;
BEGIN
  IF match_query IS NOT NULL AND match_query <> '' THEN
    -- Hybrid search: vector + FTS via RRF (org + system chunks)
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
        c.section_heading,
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
    -- Pure vector search (org + system chunks)
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
    WHERE (c.org_id = match_org_id OR c.scope = 'system')
      AND (match_project_id IS NULL OR c.project_id = match_project_id)
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count;
  END IF;
END;
$$;

COMMENT ON FUNCTION match_rag_chunks IS 'Hybrid RAG search: vector + FTS via RRF. Searches both org-scoped and system-wide (platform) documents.';
