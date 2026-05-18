-- ============================================================================
-- Migration: 20260407240000_runtime_events_runtime_id_nullable
-- Purpose: Allow runtime_events.runtime_id to be NULL for org-scoped audit
--          events that are not tied to a specific dedicated runtime.
--
-- Background:
--   The original schema (20260322300000_dedicated_runtimes.sql) declared
--   `runtime_id UUID NOT NULL REFERENCES dedicated_runtimes(id)` because at
--   the time every event was emitted by a dedicated runtime via REST
--   phone-home. Since then we added control-plane-side audit emits for
--   agent governance actions (`updateAgentStatus` in src/lib/db/mission-control.ts)
--   that are not associated with any specific runtime — those inserts pass
--   `runtime_id: null` and were silently failing the NOT NULL constraint.
--   The .then() callback on the insert only logged a warning, so the audit
--   trail was effectively dead code.
--
--   Making the column nullable lets non-runtime-scoped events land alongside
--   runtime-scoped ones in the same feed view. Runtime-scoped events still
--   carry their FK and cascade-delete with the runtime row.
-- ============================================================================

ALTER TABLE runtime_events
  ALTER COLUMN runtime_id DROP NOT NULL;
