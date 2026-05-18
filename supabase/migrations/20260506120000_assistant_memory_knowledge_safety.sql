-- Phase 0 Lucid Knowledge safety bridge.
-- Keep assistant_memory as the assistant/user memory table, but add the
-- provenance and scoped semantic-search contract needed before live recall.

ALTER TABLE assistant_memory
  ADD COLUMN IF NOT EXISTS source_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_run_id TEXT,
  ADD COLUMN IF NOT EXISTS source_channel_type TEXT,
  ADD COLUMN IF NOT EXISTS source_channel_id UUID REFERENCES assistant_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_conversation_id UUID,
  ADD COLUMN IF NOT EXISTS source_inbound_event_id UUID REFERENCES assistant_inbound_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS source_evidence_handle TEXT,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS assistant_memory_scope_lookup_idx
  ON assistant_memory (assistant_id, scoped_user_id, last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS assistant_memory_source_org_idx
  ON assistant_memory (source_org_id)
  WHERE source_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assistant_memory_source_project_idx
  ON assistant_memory (source_project_id)
  WHERE source_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assistant_memory_source_channel_idx
  ON assistant_memory (source_channel_type, source_channel_id)
  WHERE source_channel_type IS NOT NULL;

CREATE OR REPLACE FUNCTION search_memory_v2(
  p_assistant_id UUID,
  p_scoped_user_id TEXT,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_threshold DOUBLE PRECISION DEFAULT 0.7,
  p_categories TEXT[] DEFAULT NULL,
  p_org_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_channel_type TEXT DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  assistant_id UUID,
  scoped_user_id TEXT,
  content TEXT,
  content_encrypted TEXT,
  content_iv TEXT,
  content_auth_tag TEXT,
  encryption_mode TEXT,
  key_id TEXT,
  category TEXT,
  importance DOUBLE PRECISION,
  similarity DOUBLE PRECISION,
  source_user_message TEXT,
  source_assistant_response TEXT,
  source_org_id UUID,
  source_project_id UUID,
  source_run_id TEXT,
  source_channel_type TEXT,
  source_channel_id UUID,
  source_conversation_id UUID,
  source_inbound_event_id UUID,
  source_external_message_id TEXT,
  source_evidence_handle TEXT,
  source_metadata JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    m.id,
    m.assistant_id,
    m.scoped_user_id,
    m.content,
    m.content_encrypted::TEXT,
    m.content_iv,
    m.content_auth_tag,
    m.encryption_mode,
    m.key_id,
    m.category,
    m.importance::DOUBLE PRECISION,
    (1 - (m.embedding <=> p_query_embedding))::DOUBLE PRECISION AS similarity,
    m.source_user_message,
    m.source_assistant_response,
    m.source_org_id,
    m.source_project_id,
    m.source_run_id,
    m.source_channel_type,
    m.source_channel_id,
    m.source_conversation_id,
    m.source_inbound_event_id,
    m.source_external_message_id,
    m.source_evidence_handle,
    m.source_metadata
  FROM assistant_memory m
  WHERE m.assistant_id = p_assistant_id
    AND m.scoped_user_id = p_scoped_user_id
    AND m.embedding IS NOT NULL
    AND (p_categories IS NULL OR m.category = ANY(p_categories))
    AND (p_org_id IS NULL OR m.source_org_id IS NULL OR m.source_org_id = p_org_id)
    AND (p_project_id IS NULL OR m.source_project_id IS NULL OR m.source_project_id = p_project_id)
    AND (p_channel_type IS NULL OR m.source_channel_type IS NULL OR m.source_channel_type = p_channel_type)
    AND (p_conversation_id IS NULL OR m.source_conversation_id IS NULL OR m.source_conversation_id = p_conversation_id)
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY m.embedding <=> p_query_embedding, m.importance DESC, m.last_accessed_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;
