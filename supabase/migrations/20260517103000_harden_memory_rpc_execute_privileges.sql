-- Harden Knowledge/Memory SECURITY DEFINER RPC exposure.
--
-- These RPCs read tenant memory/knowledge data using caller-supplied org IDs.
-- Runtime access should flow through the Lucid control plane/service role,
-- where application-level tenant checks, audit logging, and prompt sanitizers
-- are enforced.

DO $$
DECLARE
  proc RECORD;
BEGIN
  FOR proc IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname = 'match_rag_chunks'
        OR p.proname = 'get_board_memories'
        OR p.proname = 'get_recent_memories_v2'
        OR p.proname LIKE 'mc\_%' ESCAPE '\'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', proc.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', proc.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', proc.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', proc.signature);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Users can view memory for their assistants" ON assistant_memory;
DROP POLICY IF EXISTS assistant_memory_admin_read ON assistant_memory;
CREATE POLICY assistant_memory_admin_read ON assistant_memory
  FOR SELECT TO authenticated
  USING (
    assistant_id IN (
      SELECT a.id
      FROM ai_assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION get_board_memories(
  p_org_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance NUMERIC,
  source TEXT,
  source_agent_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (
    auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = p_org_id AND om.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  RETURN QUERY
    SELECT
      bm.id,
      bm.content,
      bm.category,
      bm.importance,
      bm.source,
      bm.source_agent_id,
      bm.created_at
    FROM org_board_memory bm
    WHERE bm.org_id = p_org_id
      AND bm.is_archived = false
      AND bm.content IS NOT NULL
    ORDER BY bm.importance DESC, bm.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$;

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
  safe_match_count INT := LEAST(GREATEST(match_count, 1), 50);
BEGIN
  IF auth.role() <> 'service_role' AND (
    auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = match_org_id AND om.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

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
      LIMIT safe_match_count * 3
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
      LIMIT safe_match_count * 3
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
    LIMIT safe_match_count;
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
      c.section_heading
    FROM rag_chunks c
    JOIN rag_documents d ON d.id = c.document_id
    WHERE (c.org_id = match_org_id OR c.scope = 'system')
      AND (match_project_id IS NULL OR c.project_id = match_project_id)
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT safe_match_count;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION match_rag_chunks(VECTOR(1536), UUID, UUID, FLOAT, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_board_memories(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_recent_memories_v2(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_rag_chunks(VECTOR(1536), UUID, UUID, FLOAT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_board_memories(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION get_recent_memories_v2(UUID, TEXT, INT) TO service_role;

CREATE OR REPLACE FUNCTION get_recent_memories_v2(
  p_assistant_id UUID,
  p_scoped_user_id TEXT,
  p_limit INT DEFAULT 10
) RETURNS TABLE (
  id UUID,
  content TEXT,
  content_encrypted TEXT,
  content_iv TEXT,
  content_auth_tag TEXT,
  encryption_mode TEXT,
  key_id TEXT,
  category TEXT,
  importance FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'get_recent_memories_v2 is service-role only';
  END IF;

  RETURN QUERY
    SELECT m.id, m.content, m.content_encrypted, m.content_iv, m.content_auth_tag,
           m.encryption_mode, m.key_id, m.category, m.importance::FLOAT
    FROM assistant_memory m
    WHERE m.assistant_id = p_assistant_id
      AND m.scoped_user_id = p_scoped_user_id
    ORDER BY m.last_accessed_at DESC NULLS LAST
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$;
