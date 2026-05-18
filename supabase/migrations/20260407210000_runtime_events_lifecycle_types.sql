-- ============================================================================
-- Migration: 20260407210000_runtime_events_lifecycle_types
-- Purpose: Extend runtime_events.event_type CHECK constraint to cover the
--          remaining event types written by the worker + control plane.
--
-- Background:
--   20260407200000 widened the constraint for channel_* events but missed
--   the agent lifecycle and approval events that the runtime emits via
--   reportEvent() and the worker writes via agent-state-machine.ts. The zod
--   feedEventTypeSchema (src/lib/mission-control/schemas.ts) and the
--   FeedEventType wire union (packages/agent-bridge/src/types.ts) already
--   include these — the DB constraint was the only layer still rejecting them.
--   This migration brings the DB into sync with the wire contract.
-- ============================================================================

ALTER TABLE runtime_events
  DROP CONSTRAINT IF EXISTS runtime_events_event_type_check;

ALTER TABLE runtime_events
  ADD CONSTRAINT runtime_events_event_type_check
  CHECK (event_type IN (
    'tool_call', 'tool_result', 'error',
    'message_received', 'message_sent',
    'run_started', 'run_finished',
    'channel_connected', 'channel_disconnected', 'channel_deactivated',
    'approval_requested', 'approval_resolved',
    'agent_paused', 'agent_resumed'
  ));
