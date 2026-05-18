-- ============================================================================
-- Migration 044: AI Assistants System
-- 
-- Complete database schema for WhatsApp/Telegram AI assistants with:
-- - Outbox pattern (reliable message delivery)
-- - Atomic claim-by-id with FOR UPDATE SKIP LOCKED
-- - Lease-based locking with heartbeat renewal (locked_until)
-- - Hash-based webhook validation (no decryption needed)
-- - Proper RLS policies for multi-tenancy
-- ============================================================================

-- Enable pgvector if not already (for memory embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. ENCRYPTED SECRETS (Store channel credentials securely)
-- ============================================================================

CREATE TABLE IF NOT EXISTS encrypted_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_data TEXT NOT NULL, -- AES-256-GCM encrypted JSON
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. AI ASSISTANTS (Main entity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Multi-tenancy (follows LucidMerged hierarchy)
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  env_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  
  -- Identity
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  avatar_url TEXT,
  
  -- AI Configuration
  system_prompt TEXT CHECK (char_length(system_prompt) <= 10000),
  lucid_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER NOT NULL DEFAULT 4096 CHECK (max_tokens >= 100 AND max_tokens <= 32000),
  
  -- Tool configuration (n8n nodes this assistant can use)
  enabled_n8n_nodes TEXT[] NOT NULL DEFAULT '{}',
  
  -- Memory configuration
  memory_enabled BOOLEAN NOT NULL DEFAULT true,
  memory_window_size INTEGER NOT NULL DEFAULT 10 CHECK (memory_window_size >= 1 AND memory_window_size <= 100),
  
  -- Lucid Layer integration
  passport_id UUID, -- For portable identity
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Ownership
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- Soft delete
);

-- Indexes for common queries
CREATE INDEX idx_ai_assistants_org ON ai_assistants(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_assistants_project ON ai_assistants(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_assistants_env ON ai_assistants(env_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_assistants_active ON ai_assistants(is_active) WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. ASSISTANT CHANNELS (Telegram, WhatsApp, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  
  -- Channel type
  channel_type TEXT NOT NULL CHECK (channel_type IN ('telegram', 'whatsapp', 'web', 'discord')),
  
  -- Security: Hash for webhook validation (compare without decryption)
  secret_token_hash TEXT NOT NULL,
  
  -- Encrypted secrets (only decrypted in worker)
  encrypted_secrets_id UUID REFERENCES encrypted_secrets(id) ON DELETE SET NULL,
  
  -- External identifier (bot username, phone number, etc.)
  external_channel_id TEXT,
  
  -- Webhook URL for this channel
  webhook_url TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One active channel per type per assistant
  UNIQUE(assistant_id, channel_type) WHERE is_active = true
);

CREATE INDEX idx_channels_assistant ON assistant_channels(assistant_id);
CREATE INDEX idx_channels_type ON assistant_channels(channel_type) WHERE is_active = true;

-- ============================================================================
-- 4. INBOUND EVENTS (Messages FROM channels - Outbox pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_inbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES assistant_channels(id) ON DELETE CASCADE,
  
  -- External identifiers (from Telegram/WhatsApp)
  external_message_id TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  external_chat_id TEXT NOT NULL,
  
  -- Message content
  message_text TEXT,
  message_data JSONB, -- For media, buttons, etc.
  
  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Lease/lock for worker claim (using locked_until pattern)
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  locked_until TIMESTAMPTZ, -- Explicit deadline (cleaner than last_heartbeat)
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Idempotency: prevent duplicate inserts from same webhook
  UNIQUE(channel_id, external_message_id)
);

-- Indexes for polling (critical for performance)
CREATE INDEX idx_inbound_pending ON assistant_inbound_events(status, next_attempt_at, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_inbound_channel ON assistant_inbound_events(channel_id, created_at DESC);

-- Index for stuck event cleanup (Issue #5 fix)
CREATE INDEX idx_inbound_stuck_scan ON assistant_inbound_events(status, locked_until)
  WHERE status = 'processing';

-- ============================================================================
-- 5. OUTBOUND EVENTS (Messages TO channels - Outbox pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_outbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES assistant_channels(id) ON DELETE CASCADE,
  
  -- Link to inbound event that triggered this response
  inbound_event_id UUID REFERENCES assistant_inbound_events(id) ON DELETE SET NULL,
  conversation_id UUID, -- Will reference assistant_conversations
  
  -- Message content
  message_text TEXT NOT NULL,
  reply_to_external_id TEXT, -- For reply threading
  
  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Lease/lock for worker claim
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  locked_until TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  
  -- Response from channel API
  external_message_id TEXT
);

-- Indexes for polling
CREATE INDEX idx_outbound_pending ON assistant_outbound_events(status, next_attempt_at, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_outbound_channel ON assistant_outbound_events(channel_id, created_at DESC);

-- Index for stuck event cleanup
CREATE INDEX idx_outbound_stuck_scan ON assistant_outbound_events(status, locked_until)
  WHERE status = 'processing';

-- ============================================================================
-- 6. CONVERSATIONS (Sessions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES assistant_channels(id) ON DELETE CASCADE,
  
  -- External user who started this conversation
  external_user_id TEXT NOT NULL,
  external_chat_id TEXT NOT NULL,
  
  -- Metadata
  title TEXT, -- Auto-generated or user-set
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  
  -- One active conversation per external user per channel
  UNIQUE(channel_id, external_user_id, external_chat_id)
);

CREATE INDEX idx_conversations_assistant ON assistant_conversations(assistant_id);
CREATE INDEX idx_conversations_channel ON assistant_conversations(channel_id);
CREATE INDEX idx_conversations_external ON assistant_conversations(external_user_id, external_chat_id);

-- Add FK to outbound events
ALTER TABLE assistant_outbound_events 
  ADD CONSTRAINT fk_outbound_conversation 
  FOREIGN KEY (conversation_id) REFERENCES assistant_conversations(id) ON DELETE SET NULL;

-- ============================================================================
-- 7. MESSAGES (Transcript)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  
  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  
  -- Tool call info (if role = 'tool')
  tool_name TEXT,
  tool_input JSONB,
  tool_output JSONB,
  
  -- External reference (for user messages from channels)
  external_message_id TEXT,
  
  -- Token usage tracking
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON assistant_messages(conversation_id, created_at ASC);
CREATE INDEX idx_messages_role ON assistant_messages(conversation_id, role);

-- ============================================================================
-- 8. MEMORY (Long-term extracted facts with vector embeddings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES assistant_conversations(id) ON DELETE SET NULL,
  
  -- Memory content
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 / text-embedding-3-small dimension
  
  -- Categorization
  category TEXT NOT NULL DEFAULT 'fact' CHECK (category IN ('fact', 'preference', 'instruction', 'context')),
  importance NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  
  -- Source tracking
  source_message_id UUID REFERENCES assistant_messages(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ
);

-- Index for vector similarity search
CREATE INDEX idx_memory_embedding ON assistant_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX idx_memory_assistant ON assistant_memory(assistant_id);
CREATE INDEX idx_memory_category ON assistant_memory(assistant_id, category);

-- ============================================================================
-- 9. RPC FUNCTIONS (Atomic claim with FOR UPDATE SKIP LOCKED)
-- ============================================================================

-- Claim next inbound event(s) for processing
CREATE OR REPLACE FUNCTION claim_next_inbound_event(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 1
)
RETURNS SETOF assistant_inbound_events
LANGUAGE plpgsql
AS $$
BEGIN
  -- Atomic claim: SELECT FOR UPDATE SKIP LOCKED then UPDATE
  RETURN QUERY
  UPDATE assistant_inbound_events
  SET 
    status = 'processing',
    locked_at = NOW(),
    locked_by = p_worker_id,
    locked_until = NOW() + INTERVAL '15 minutes', -- 15 min lease
    attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM assistant_inbound_events
    WHERE status = 'pending'
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      AND attempts < max_attempts
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

-- Claim next outbound event(s) for sending
CREATE OR REPLACE FUNCTION claim_next_outbound_event(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 1
)
RETURNS SETOF assistant_outbound_events
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE assistant_outbound_events
  SET 
    status = 'processing',
    locked_at = NOW(),
    locked_by = p_worker_id,
    locked_until = NOW() + INTERVAL '15 minutes',
    attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM assistant_outbound_events
    WHERE status = 'pending'
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      AND attempts < max_attempts
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

-- Renew lease (heartbeat pattern)
CREATE OR REPLACE FUNCTION renew_event_lease(
  p_event_id UUID,
  p_worker_id TEXT,
  p_event_type TEXT DEFAULT 'inbound' -- 'inbound' or 'outbound'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_event_type = 'inbound' THEN
    UPDATE assistant_inbound_events
    SET locked_until = NOW() + INTERVAL '15 minutes'
    WHERE id = p_event_id
      AND locked_by = p_worker_id
      AND status = 'processing';
  ELSE
    UPDATE assistant_outbound_events
    SET locked_until = NOW() + INTERVAL '15 minutes'
    WHERE id = p_event_id
      AND locked_by = p_worker_id
      AND status = 'processing';
  END IF;
  
  RETURN FOUND;
END;
$$;

-- Reset stuck events (separate cleanup job - NOT in claim functions)
CREATE OR REPLACE FUNCTION reset_stuck_events()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  inbound_reset INTEGER;
  outbound_reset INTEGER;
BEGIN
  -- Reset stuck inbound events (locked_until expired)
  WITH reset_inbound AS (
    UPDATE assistant_inbound_events
    SET 
      status = 'pending',
      locked_at = NULL,
      locked_by = NULL,
      locked_until = NULL
    WHERE status = 'processing'
      AND locked_until < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO inbound_reset FROM reset_inbound;
  
  -- Reset stuck outbound events
  WITH reset_outbound AS (
    UPDATE assistant_outbound_events
    SET 
      status = 'pending',
      locked_at = NULL,
      locked_by = NULL,
      locked_until = NULL
    WHERE status = 'processing'
      AND locked_until < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO outbound_reset FROM reset_outbound;
  
  RETURN json_build_object(
    'inbound_reset', inbound_reset,
    'outbound_reset', outbound_reset,
    'reset_at', NOW()
  );
END;
$$;

-- Get or create conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_assistant_id UUID,
  p_channel_id UUID,
  p_external_user_id TEXT,
  p_external_chat_id TEXT
)
RETURNS assistant_conversations
LANGUAGE plpgsql
AS $$
DECLARE
  v_conversation assistant_conversations;
BEGIN
  -- Try to find existing
  SELECT * INTO v_conversation
  FROM assistant_conversations
  WHERE channel_id = p_channel_id
    AND external_user_id = p_external_user_id
    AND external_chat_id = p_external_chat_id
    AND is_active = true;
  
  -- Create if not found
  IF NOT FOUND THEN
    INSERT INTO assistant_conversations (
      assistant_id, channel_id, external_user_id, external_chat_id
    ) VALUES (
      p_assistant_id, p_channel_id, p_external_user_id, p_external_chat_id
    )
    RETURNING * INTO v_conversation;
  ELSE
    -- Update last activity
    UPDATE assistant_conversations
    SET updated_at = NOW()
    WHERE id = v_conversation.id;
  END IF;
  
  RETURN v_conversation;
END;
$$;

-- Similarity search for memory
CREATE OR REPLACE FUNCTION search_memory(
  p_assistant_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_threshold NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance NUMERIC,
  similarity NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.category,
    m.importance,
    (1 - (m.embedding <=> p_query_embedding))::NUMERIC AS similarity
  FROM assistant_memory m
  WHERE m.assistant_id = p_assistant_id
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 10. RLS POLICIES (Row Level Security)
-- ============================================================================

ALTER TABLE ai_assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_outbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_secrets ENABLE ROW LEVEL SECURITY;

-- AI Assistants: Users can manage assistants in their org
CREATE POLICY "Users can view assistants in their org" ON ai_assistants
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert assistants in their org" ON ai_assistants
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Users can update assistants in their org" ON ai_assistants
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete assistants" ON ai_assistants
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Channels: Inherit from assistant permissions
CREATE POLICY "Users can view channels for their assistants" ON assistant_channels
  FOR SELECT
  USING (
    assistant_id IN (
      SELECT id FROM ai_assistants
      WHERE org_id IN (
        SELECT om.org_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage channels for their assistants" ON assistant_channels
  FOR ALL
  USING (
    assistant_id IN (
      SELECT id FROM ai_assistants
      WHERE org_id IN (
        SELECT om.org_id FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin')
      )
    )
  );

-- Conversations: Inherit from channel permissions
CREATE POLICY "Users can view conversations for their channels" ON assistant_conversations
  FOR SELECT
  USING (
    channel_id IN (
      SELECT c.id FROM assistant_channels c
      JOIN ai_assistants a ON c.assistant_id = a.id
      WHERE a.org_id IN (
        SELECT om.org_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    )
  );

-- Messages: Inherit from conversation permissions
CREATE POLICY "Users can view messages in their conversations" ON assistant_messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT c.id FROM assistant_conversations c
      JOIN assistant_channels ch ON c.channel_id = ch.id
      JOIN ai_assistants a ON ch.assistant_id = a.id
      WHERE a.org_id IN (
        SELECT om.org_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    )
  );

-- Memory: Inherit from assistant permissions
CREATE POLICY "Users can view memory for their assistants" ON assistant_memory
  FOR SELECT
  USING (
    assistant_id IN (
      SELECT id FROM ai_assistants
      WHERE org_id IN (
        SELECT om.org_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage memory for their assistants" ON assistant_memory
  FOR ALL
  USING (
    assistant_id IN (
      SELECT id FROM ai_assistants
      WHERE org_id IN (
        SELECT om.org_id FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin')
      )
    )
  );

-- Events: Service role only (worker uses service key)
-- No user-facing RLS - events are processed by worker

-- Encrypted secrets: Service role only
-- No user-facing access to encrypted data

-- ============================================================================
-- 11. TRIGGERS
-- ============================================================================

-- Update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_assistants_updated_at
  BEFORE UPDATE ON ai_assistants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_assistant_channels_updated_at
  BEFORE UPDATE ON assistant_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_assistant_conversations_updated_at
  BEFORE UPDATE ON assistant_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_encrypted_secrets_updated_at
  BEFORE UPDATE ON encrypted_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update conversation last_message_at when message inserted
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE assistant_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_last_message_trigger
  AFTER INSERT ON assistant_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- ============================================================================
-- 12. GRANTS (for service role access from worker)
-- ============================================================================

-- These grants allow the service role (used by worker) to access event tables
-- without RLS restrictions

GRANT SELECT, INSERT, UPDATE ON assistant_inbound_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON assistant_outbound_events TO service_role;
GRANT SELECT ON assistant_channels TO service_role;
GRANT SELECT ON ai_assistants TO service_role;
GRANT SELECT ON encrypted_secrets TO service_role;
GRANT SELECT, INSERT ON assistant_conversations TO service_role;
GRANT SELECT, INSERT ON assistant_messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON assistant_memory TO service_role;
GRANT EXECUTE ON FUNCTION claim_next_inbound_event TO service_role;
GRANT EXECUTE ON FUNCTION claim_next_outbound_event TO service_role;
GRANT EXECUTE ON FUNCTION renew_event_lease TO service_role;
GRANT EXECUTE ON FUNCTION reset_stuck_events TO service_role;
GRANT EXECUTE ON FUNCTION get_or_create_conversation TO service_role;
GRANT EXECUTE ON FUNCTION search_memory TO service_role;

-- ============================================================================
-- Done! 
-- 
-- This migration creates a production-ready AI Assistants system with:
-- - Outbox pattern for reliable message delivery
-- - Atomic claim with FOR UPDATE SKIP LOCKED (no race conditions)
-- - Lease-based locking with locked_until (heartbeat pattern)
-- - Separate cleanup job (not in claim functions)
-- - Proper indexes for fast polling
-- - RLS policies for multi-tenant security
-- - Vector search for memory retrieval
-- ============================================================================