-- Redis Streams Ingest Scaling: idempotency keys for event and cost deduplication
-- Enables ON CONFLICT DO NOTHING for events and windowed UPSERT for costs

-- Add ingest idempotency key to runtime_events
ALTER TABLE runtime_events ADD COLUMN IF NOT EXISTS ingest_event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_events_ingest_id
  ON runtime_events (ingest_event_id) WHERE ingest_event_id IS NOT NULL;

COMMENT ON COLUMN runtime_events.ingest_event_id IS 'Idempotency key for Redis Streams ingest (format: runtimeId:timestamp:batchIndex)';

-- Add runtime_id to mc_agent_cost_tracking if not present (needed for cost window dedupe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mc_agent_cost_tracking' AND column_name = 'runtime_id'
  ) THEN
    ALTER TABLE mc_agent_cost_tracking ADD COLUMN runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add cost window dedupe columns to mc_agent_cost_tracking
ALTER TABLE mc_agent_cost_tracking
  ADD COLUMN IF NOT EXISTS window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS window_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cost_seq INT DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_tracking_window_dedupe
  ON mc_agent_cost_tracking (runtime_id, window_start, cost_seq)
  WHERE runtime_id IS NOT NULL AND window_start IS NOT NULL;

COMMENT ON COLUMN mc_agent_cost_tracking.window_start IS 'Cost aggregation window start (floor to 60s) for Redis ingest dedupe';
COMMENT ON COLUMN mc_agent_cost_tracking.cost_seq IS 'Monotonic sequence within cost window for dedupe';
