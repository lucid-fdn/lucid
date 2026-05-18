-- ============================================================================
-- AI Platform Migration
-- Adds support for: API Keys, Conversations, Messages, Documents (RAG), Token Quotas
-- ============================================================================

-- Enable pgvector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- API KEYS (for external access)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Key details
  name text NOT NULL,
  key_hash text NOT NULL, -- SHA-256 hash of the key
  key_prefix text NOT NULL, -- First 8 chars for identification (e.g., "luc_abc1")
  
  -- Permissions
  scopes text[] DEFAULT ARRAY['chat', 'documents', 'processors']::text[],
  
  -- Rate limiting
  rate_limit_per_minute int DEFAULT 60,
  rate_limit_per_day int DEFAULT 10000,
  
  -- Status
  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  usage_count int DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz, -- NULL = never expires
  revoked_at timestamptz,
  
  UNIQUE(key_hash)
);

-- Index for fast lookup
CREATE INDEX idx_api_keys_org ON api_keys(org_id);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;

-- ============================================================================
-- CONVERSATIONS (Chat sessions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Conversation details
  title text, -- Auto-generated from first message or user-set
  model text NOT NULL, -- e.g., "meta-llama/llama-3.1-70b-instruct"
  provider text NOT NULL, -- e.g., "together", "groq", "openai"
  
  -- Configuration
  system_prompt text,
  temperature float DEFAULT 0.7,
  max_tokens int DEFAULT 4096,
  
  -- RAG settings
  rag_enabled boolean DEFAULT false,
  rag_document_ids uuid[] DEFAULT ARRAY[]::uuid[],
  
  -- Token usage
  total_input_tokens int DEFAULT 0,
  total_output_tokens int DEFAULT 0,
  total_cost_cents int DEFAULT 0, -- Store cost in cents for precision
  
  -- Status
  is_archived boolean DEFAULT false,
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_conversations_org ON conversations(org_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_created ON conversations(created_at DESC);
CREATE INDEX idx_conversations_active ON conversations(org_id, user_id) WHERE is_archived = false;

-- ============================================================================
-- MESSAGES (Chat messages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Message content
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content text NOT NULL,
  
  -- For tool calls (function calling)
  tool_calls jsonb, -- Array of tool calls
  tool_call_id text, -- For tool response messages
  
  -- Token usage (per message)
  input_tokens int,
  output_tokens int,
  
  -- RAG context (if used)
  rag_context jsonb, -- { chunks: [...], document_ids: [...] }
  
  -- Model info
  model text, -- Model used for this specific message (can change mid-conversation)
  finish_reason text, -- 'stop', 'length', 'tool_calls', etc.
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_role ON messages(conversation_id, role);

-- ============================================================================
-- DOCUMENTS (for RAG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Document details
  name text NOT NULL,
  description text,
  mime_type text NOT NULL,
  file_size int NOT NULL, -- bytes
  
  -- Storage
  storage_path text NOT NULL, -- Path in Supabase storage
  storage_bucket text DEFAULT 'documents',
  
  -- Processing status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error_message text,
  
  -- Chunking info
  chunk_count int DEFAULT 0,
  chunk_strategy text DEFAULT 'recursive', -- 'recursive', 'semantic', 'fixed'
  chunk_size int DEFAULT 1000,
  chunk_overlap int DEFAULT 200,
  
  -- Metadata
  metadata jsonb DEFAULT '{}', -- Can store: original_filename, extracted_text_preview, etc.
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Indexes
CREATE INDEX idx_documents_org ON documents(org_id);
CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_status ON documents(status);

-- ============================================================================
-- DOCUMENT CHUNKS (vector embeddings for RAG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  -- Chunk content
  content text NOT NULL,
  chunk_index int NOT NULL, -- Order in document
  
  -- Vector embedding (OpenAI text-embedding-3-small = 1536 dimensions)
  embedding vector(1536),
  
  -- Metadata
  metadata jsonb DEFAULT '{}', -- Can store: page_number, section_title, etc.
  token_count int,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_order ON document_chunks(document_id, chunk_index);

-- Vector similarity search index (HNSW for fast approximate search)
CREATE INDEX idx_chunks_embedding ON document_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- TOKEN QUOTAS (extends existing usage_metrics pattern)
-- ============================================================================

-- Add AI-specific metrics to the existing usage tracking system
-- The existing increment_usage_metric function can be used

-- Create a view for easy AI usage tracking
CREATE OR REPLACE VIEW ai_usage_summary AS
SELECT 
  org_id,
  SUM(CASE WHEN metric_name = 'ai_input_tokens' THEN value ELSE 0 END) as total_input_tokens,
  SUM(CASE WHEN metric_name = 'ai_output_tokens' THEN value ELSE 0 END) as total_output_tokens,
  SUM(CASE WHEN metric_name = 'ai_requests' THEN value ELSE 0 END) as total_requests,
  SUM(CASE WHEN metric_name = 'ai_cost_cents' THEN value ELSE 0 END) as total_cost_cents,
  MAX(period_start) as period_start,
  MAX(period_end) as period_end
FROM usage_metrics
WHERE metric_name LIKE 'ai_%'
GROUP BY org_id;

-- ============================================================================
-- AI PROCESSOR RUNS (track processor executions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS processor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Processor details
  processor_id text NOT NULL, -- e.g., 'summary', 'sentiment', 'translation', 'code'
  processor_version text DEFAULT '1.0',
  
  -- Input/Output
  input_text text NOT NULL,
  input_tokens int,
  output_result jsonb NOT NULL, -- Processor-specific result
  output_tokens int,
  
  -- Model used
  model text NOT NULL,
  provider text NOT NULL,
  
  -- Cost tracking
  cost_cents int DEFAULT 0,
  
  -- Timing
  duration_ms int, -- Processing time
  
  -- Status
  status text DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'timeout')),
  error_message text,
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_processor_runs_org ON processor_runs(org_id);
CREATE INDEX idx_processor_runs_user ON processor_runs(user_id);
CREATE INDEX idx_processor_runs_processor ON processor_runs(processor_id);
CREATE INDEX idx_processor_runs_created ON processor_runs(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE processor_runs ENABLE ROW LEVEL SECURITY;

-- API Keys: Users see their own, org admins see all in org
CREATE POLICY "api_keys_select" ON api_keys FOR SELECT USING (
  user_id = auth.uid() OR
  org_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "api_keys_insert" ON api_keys FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "api_keys_update" ON api_keys FOR UPDATE USING (
  user_id = auth.uid() OR
  org_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "api_keys_delete" ON api_keys FOR DELETE USING (
  user_id = auth.uid() OR
  org_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Conversations: Users see their own within their orgs
CREATE POLICY "conversations_select" ON conversations FOR SELECT USING (
  user_id = auth.uid() AND
  org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "conversations_insert" ON conversations FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "conversations_update" ON conversations FOR UPDATE USING (
  user_id = auth.uid()
);

CREATE POLICY "conversations_delete" ON conversations FOR DELETE USING (
  user_id = auth.uid()
);

-- Messages: Access through conversation ownership
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()
  )
);

-- Documents: Users see their own within their orgs
CREATE POLICY "documents_select" ON documents FOR SELECT USING (
  org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "documents_insert" ON documents FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "documents_update" ON documents FOR UPDATE USING (
  user_id = auth.uid()
);

CREATE POLICY "documents_delete" ON documents FOR DELETE USING (
  user_id = auth.uid()
);

-- Document Chunks: Access through document ownership
CREATE POLICY "chunks_select" ON document_chunks FOR SELECT USING (
  document_id IN (
    SELECT id FROM documents WHERE org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
);

-- Service role bypass for chunk insertion (during processing)
CREATE POLICY "chunks_insert_service" ON document_chunks FOR INSERT WITH CHECK (true);

-- Processor Runs: Users see their own
CREATE POLICY "processor_runs_select" ON processor_runs FOR SELECT USING (
  user_id = auth.uid()
);

CREATE POLICY "processor_runs_insert" ON processor_runs FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to search document chunks by similarity
CREATE OR REPLACE FUNCTION search_document_chunks(
  p_query_embedding vector(1536),
  p_document_ids uuid[],
  p_match_count int DEFAULT 5,
  p_match_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  metadata jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> p_query_embedding) as similarity,
    dc.metadata
  FROM document_chunks dc
  WHERE 
    dc.document_id = ANY(p_document_ids)
    AND 1 - (dc.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY dc.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Function to get conversation with messages
CREATE OR REPLACE FUNCTION get_conversation_with_messages(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  conversation_data jsonb,
  messages_data jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_jsonb(c.*) as conversation_data,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.created_at)
       FROM messages m WHERE m.conversation_id = c.id),
      '[]'::jsonb
    ) as messages_data
  FROM conversations c
  WHERE c.id = p_conversation_id AND c.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Function to update conversation stats after message
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET 
    total_input_tokens = total_input_tokens + COALESCE(NEW.input_tokens, 0),
    total_output_tokens = total_output_tokens + COALESCE(NEW.output_tokens, 0),
    updated_at = now()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_stats
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_stats();

-- Function to generate conversation title from first user message
CREATE OR REPLACE FUNCTION auto_generate_conversation_title()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for first user message and if no title set
  IF NEW.role = 'user' THEN
    UPDATE conversations
    SET title = LEFT(NEW.content, 100)
    WHERE id = NEW.conversation_id 
      AND title IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_title
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION auto_generate_conversation_title();

-- ============================================================================
-- STORAGE BUCKET FOR DOCUMENTS
-- ============================================================================

-- Create storage bucket for documents (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for documents bucket
CREATE POLICY "documents_storage_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM organizations WHERE id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "documents_storage_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM organizations WHERE id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "documents_storage_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM organizations WHERE id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
);

-- ============================================================================
-- DONE
-- ============================================================================

COMMENT ON TABLE api_keys IS 'API keys for external access to AI features';
COMMENT ON TABLE conversations IS 'Chat conversations with AI models';
COMMENT ON TABLE messages IS 'Messages within conversations';
COMMENT ON TABLE documents IS 'Documents for RAG (Retrieval Augmented Generation)';
COMMENT ON TABLE document_chunks IS 'Chunked document content with vector embeddings';
COMMENT ON TABLE processor_runs IS 'AI processor execution history';
