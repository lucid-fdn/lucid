CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE knowledge_claims
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'ready', 'error', 'not_required')),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS embedding_error TEXT,
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS semantic_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS semantic_cluster_key TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_embedding_ready
  ON knowledge_claims(org_id, status, embedding_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_semantic_cluster
  ON knowledge_claims(org_id, semantic_cluster_key, status)
  WHERE semantic_cluster_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_semantic_fingerprint
  ON knowledge_claims(org_id, semantic_fingerprint)
  WHERE semantic_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_embedding_hnsw
  ON knowledge_claims USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN knowledge_claims.embedding IS
  'Semantic embedding for claim subject/body governance recall and drift detection.';
COMMENT ON COLUMN knowledge_claims.embedding_status IS
  'Lifecycle status for claim semantic embedding generation.';
COMMENT ON COLUMN knowledge_claims.semantic_fingerprint IS
  'Stable normalized hash of claim semantic text for drift/change detection.';
COMMENT ON COLUMN knowledge_claims.semantic_cluster_key IS
  'Stable normalized hash of the claim subject used to group likely conflicts.';
