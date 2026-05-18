-- ============================================================================
-- Migration: 20260407201000_runtime_events_critical_severity
-- Purpose: Expand the runtime_events.severity CHECK constraint to include
--          `critical` for operator-must-act runtime events such as
--          `channel_deactivated`.
--
-- Background:
--   The original runtime_events table allowed only info/warning/error
--   severities. The new native-channel permanent failure path emits
--   `channel_deactivated` with severity `critical`, so without this migration
--   those events would still be rejected at the DB layer even after the
--   event_type constraint was widened.
-- ============================================================================

ALTER TABLE runtime_events
  DROP CONSTRAINT IF EXISTS runtime_events_severity_check;

ALTER TABLE runtime_events
  ADD CONSTRAINT runtime_events_severity_check
  CHECK (severity IN ('info', 'warning', 'error', 'critical'));
