-- Create assistant_conversation_locks table
-- Referenced by claim_next_inbound_event RPC for conversation-level locking.
-- Prevents two workers from processing the same conversation simultaneously.

CREATE TABLE IF NOT EXISTS public.assistant_conversation_locks (
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  external_chat_id TEXT NOT NULL,
  locked_by TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (assistant_id, channel_id, external_chat_id)
);

-- Index for quick lock lookups during claim
CREATE INDEX IF NOT EXISTS idx_conversation_locks_until
  ON assistant_conversation_locks (locked_until)
  WHERE locked_until IS NOT NULL;

-- RLS: service role only (worker access)
ALTER TABLE assistant_conversation_locks ENABLE ROW LEVEL SECURITY;
