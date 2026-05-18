-- ============================================================================
-- mc_epoch_anchored: Add epoch_anchored event type to mc_receipt_events
-- ============================================================================
-- Extends the receipt events table to support L2 epoch anchoring notifications.
-- When L2 anchors an epoch to chain, a cron polls for recently anchored epochs
-- and inserts epoch_anchored events into mc_receipt_events. The live feed
-- already subscribes to mc_receipt_events via Supabase Realtime, so inserting
-- here automatically pushes to connected frontends (outbox + poll + push).

-- ── 1. Extend CHECK constraint to include epoch_anchored ───────────────────

ALTER TABLE mc_receipt_events DROP CONSTRAINT IF EXISTS mc_receipt_events_event_type_check;
ALTER TABLE mc_receipt_events ADD CONSTRAINT mc_receipt_events_event_type_check
  CHECK (event_type IN ('receipt_created', 'receipt_verified', 'passport_provisioned', 'epoch_anchored'));

-- ── 2. Dedup index for epoch_anchored events ───────────────────────────────
-- Ensures we never insert two epoch_anchored events for the same epoch_id.
-- The sync cron uses upsert/try-catch against this unique index.

CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_receipt_events_epoch_dedup
  ON mc_receipt_events((payload->>'epoch_id'))
  WHERE event_type = 'epoch_anchored' AND payload->>'epoch_id' IS NOT NULL;

-- ── 3. View: mc_feed_events_v ──────────────────────────────────────────────
-- The 8th UNION in mc_feed_events_v (from 20260324200000_mc_receipt_events.sql)
-- already selects all rows from mc_receipt_events regardless of event_type:
--
--   SELECT rce.id, rce.event_type, 'info'::TEXT AS severity, ...
--   FROM mc_receipt_events rce
--   JOIN ai_assistants aa ON aa.id = rce.agent_id
--   WHERE aa.deleted_at IS NULL;
--
-- Therefore epoch_anchored events are automatically surfaced in the feed view
-- with no schema change needed. No CREATE OR REPLACE VIEW required.
