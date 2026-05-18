-- Knowledge embedding doctor stats
-- Keeps vector-index diagnostics database-side so Brain Ops can detect
-- missing embeddings and dimension/provider drift without selecting raw vectors.

CREATE OR REPLACE FUNCTION knowledge_embedding_doctor_stats(
  p_org_id UUID,
  p_expected_dimensions INTEGER DEFAULT 1536,
  p_expected_provider_id TEXT DEFAULT 'lucid:text-embedding-3-small'
)
RETURNS TABLE (
  total_chunks BIGINT,
  missing_embedding_chunks BIGINT,
  dimension_mismatch_chunks BIGINT,
  provider_mismatch_chunks BIGINT,
  ready_documents BIGINT,
  errored_documents BIGINT,
  expected_dimensions INTEGER,
  expected_provider_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF to_regclass('public.rag_chunks') IS NULL OR to_regclass('public.rag_documents') IS NULL THEN
    RETURN QUERY SELECT
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      p_expected_dimensions,
      p_expected_provider_id;
    RETURN;
  END IF;

  RETURN QUERY EXECUTE $sql$
    SELECT
      (SELECT COUNT(*) FROM rag_chunks WHERE org_id = $1)::BIGINT AS total_chunks,
      (SELECT COUNT(*) FROM rag_chunks WHERE org_id = $1 AND embedding IS NULL)::BIGINT AS missing_embedding_chunks,
      (
        SELECT COUNT(*)
        FROM rag_chunks
        WHERE org_id = $1
          AND embedding IS NOT NULL
          AND vector_dims(embedding) <> $2
      )::BIGINT AS dimension_mismatch_chunks,
      (
        SELECT COUNT(*)
        FROM rag_chunks
        WHERE org_id = $1
          AND COALESCE(
            metadata->>'embeddingProviderId',
            metadata->>'embedding_provider_id',
            metadata->>'embeddingModel',
            metadata->>'embedding_model'
          ) IS NOT NULL
          AND COALESCE(
            metadata->>'embeddingProviderId',
            metadata->>'embedding_provider_id',
            metadata->>'embeddingModel',
            metadata->>'embedding_model'
          ) <> $3
      )::BIGINT AS provider_mismatch_chunks,
      (SELECT COUNT(*) FROM rag_documents WHERE org_id = $1 AND status = 'ready')::BIGINT AS ready_documents,
      (SELECT COUNT(*) FROM rag_documents WHERE org_id = $1 AND status IN ('error', 'failed'))::BIGINT AS errored_documents,
      $2::INTEGER AS expected_dimensions,
      $3::TEXT AS expected_provider_id
  $sql$
  USING p_org_id, p_expected_dimensions, p_expected_provider_id;
END;
$$;

GRANT EXECUTE ON FUNCTION knowledge_embedding_doctor_stats(UUID, INTEGER, TEXT) TO service_role;
