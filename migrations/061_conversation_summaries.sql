-- Migration 061: Conversation Summaries
-- Phase 2: ConversationCompactor storage
-- See docs/OPENCLAW_INTEGRATION_SPEC.md §4.1

CREATE TABLE IF NOT EXISTS assistant_conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE,
  content TEXT NOT NULL,
  message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_summaries_conversation
  ON assistant_conversation_summaries(conversation_id);

COMMENT ON TABLE assistant_conversation_summaries IS
  'Cached conversation summaries for context window compaction. One per conversation, upserted on compaction.';