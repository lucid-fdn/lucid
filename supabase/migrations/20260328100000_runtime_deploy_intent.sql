-- Server-side deploy orchestration: store agent creation intent on runtime
-- so the heartbeat handler can create the assistant when the worker connects.
-- Eliminates browser-as-orchestrator pattern.

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS pending_agent_name TEXT,
  ADD COLUMN IF NOT EXISTS pending_agent_user_id UUID,
  ADD COLUMN IF NOT EXISTS pending_agent_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_assistant_id UUID REFERENCES ai_assistants(id),
  ADD COLUMN IF NOT EXISTS intent_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS intent_error TEXT,
  ADD COLUMN IF NOT EXISTS intent_fulfilled_at TIMESTAMPTZ;

-- intent_status values: pending | fulfilling | fulfilled | failed | cleaned
-- 'fulfilling' is a transient claim state (distributed lock during assistant creation)

COMMENT ON COLUMN dedicated_runtimes.intent_status IS
  'Deploy intent state machine: pending → fulfilling → fulfilled | failed. Reconciler sets cleaned.';

-- Index for heartbeat handler: quickly find runtimes with actionable intent
CREATE INDEX IF NOT EXISTS idx_runtimes_pending_intent
  ON dedicated_runtimes (id)
  WHERE intent_status IN ('pending', 'fulfilling');

-- Drop old index if it exists (from earlier draft)
DROP INDEX IF EXISTS idx_runtimes_pending_agent;

-- Enable Realtime on dedicated_runtimes so clients can subscribe to status changes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dedicated_runtimes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dedicated_runtimes;
  END IF;
END $$;
