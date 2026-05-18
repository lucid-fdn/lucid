-- ============================================================================
-- Migration: 20260407200000_runtime_events_channel_types
-- Purpose: Expand the runtime_events.event_type CHECK constraint to include
--          channel lifecycle events.
--
-- Background:
--   The original constraint (20260322300000_dedicated_runtimes.sql) was
--   written before the C2a self-sovereign channel layer existed. The
--   ControlPlaneBridge has been emitting `channel_connected` and
--   `channel_disconnected` events for the entire C2a feature, but every one
--   of those inserts was being rejected at the DB layer with a CHECK
--   constraint violation. The events route swallowed the failure and the
--   operator never saw them.
--
--   `channel_deactivated` is added in the same migration because the
--   permanent-failure path (token revoked → adapter throws) needs to land
--   loud in the feed so an operator can rotate credentials.
-- ============================================================================

ALTER TABLE runtime_events
  DROP CONSTRAINT IF EXISTS runtime_events_event_type_check;

ALTER TABLE runtime_events
  ADD CONSTRAINT runtime_events_event_type_check
  CHECK (event_type IN (
    'tool_call', 'tool_result', 'error',
    'message_received', 'message_sent',
    'run_started', 'run_finished',
    'channel_connected', 'channel_disconnected', 'channel_deactivated'
  ));
