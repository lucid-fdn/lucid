-- ============================================================================
-- Migration 049: Multi-Tenant RAG Knowledge Base
-- ============================================================================
-- Creates tables for document storage, chunking, and vector embeddings
-- with full RLS policies for multi-tenant isolation.
--
-- Architecture:
--   rag_documents (parent) → rag_chunks (children with embeddings)
--   Scoped to: org_id + project_id (optional) + user_id (uploader)
--
-- Dependencies: pgvector extension (for VECTOR type)
-- ============================================================================

-- 1. Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2. RAG Documents Table (parent documents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Multi-tenancy scoping
  org_id UUID NOT NULL,
  project_id UUID,          -- Optional: scope to specific project
  user_id UUID NOT NULL,    -- Who uploaded this document
  
  -- Document metadata
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'upload',  -- upload, url, api, paste
  source_url TEXT,           -- Original URL if imported
  file_name TEXT,            -- Original file name
  file_size_bytes INTEGER,
  mime_type TEXT,            -- e.g., text/plain, application/pdf
  
  -- Content
  raw_content TEXT,          -- Full original text content
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, ready, error
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  
  -- Metadata (extensible)
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for rag_documents
CREATE INDEX IF NOT EXISTS idx_rag_documents_org ON rag_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_org_project ON rag_documents(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_user ON rag_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_status ON rag_documents(status);
CREATE INDEX IF NOT EXISTS idx_rag_documents_created ON rag_documents(created_at DESC);

-- ============================================================================
-- 3. RAG Chunks Table (document chunks with embeddings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parent document reference
  document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  
  -- Multi-tenancy scoping (denormalized for fast vector search)
  org_id UUID NOT NULL,
  project_id UUID,
  
  -- Chunk content
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,   -- Order within document
  
  -- Vector embedding (1536 dimensions for text-embedding-3-small)
  embedding VECTOR(1536),
  
  -- Metadata
  token_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',    -- Section headers, page numbers, etc.
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for rag_chunks
CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_org ON rag_chunks(org_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_org_project ON rag_chunks(org_id, project_id);

-- HNSW index for fast vector similarity search (cosine distance)
-- This is the critical performance index for RAG retrieval
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding ON rag_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 4. RLS Policies (Multi-Tenant Isolation)
-- ============================================================================

ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for server-side operations)
CREATE POLICY "Service role full access to rag_documents"
  ON rag_documents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to rag_chunks"
  ON rag_chunks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: org-scoped access
CREATE POLICY "Users see own org documents"
  ON rag_documents FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT om.organization_id 
      FROM organization_members om 
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own org documents"
  ON rag_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (
      SELECT om.organization_id 
      FROM organization_members om 
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own documents"
  ON rag_documents FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT om.organization_id 
      FROM organization_members om 
      WHERE om.user_id = auth.uid() 
        AND om.role IN ('owner', 'admin')
    )
  );

-- Chunks inherit document access via org_id
CREATE POLICY "Users see own org chunks"
  ON rag_chunks FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT om.organization_id 
      FROM organization_members om 
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service inserts chunks"
  ON rag_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id 
      FROM organization_members om 
      WHERE om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. Vector Similarity Search Function (RPC)
-- ============================================================================

-- Main RAG search function: finds relevant chunks for a query
CREATE OR REPLACE FUNCTION match_rag_chunks(
  query_embedding VECTOR(1536),
  match_org_id UUID,
  match_project_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INT,
  similarity FLOAT,
  metadata JSONB,
  document_title TEXT,
  source_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with elevated privileges (bypasses RLS for performance)
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) AS similarity,
    c.metadata,
    d.title AS document_title,
    d.source_type
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  WHERE c.org_id = match_org_id
    AND (match_project_id IS NULL OR c.project_id = match_project_id)
    AND d.status = 'ready'
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 6. Updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_rag_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rag_documents_updated_at
  BEFORE UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_rag_documents_updated_at();

-- ============================================================================
-- 7. Comments
-- ============================================================================

COMMENT ON TABLE rag_documents IS 'Parent documents for RAG knowledge base. Scoped to org + optional project.';
COMMENT ON TABLE rag_chunks IS 'Document chunks with vector embeddings for similarity search.';
COMMENT ON FUNCTION match_rag_chunks IS 'Vector similarity search for RAG retrieval. Returns top-K most similar chunks.';