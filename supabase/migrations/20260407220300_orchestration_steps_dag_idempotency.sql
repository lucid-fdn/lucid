-- Phase 4N-a follow-up: Split the orchestration_steps idempotency index
-- so DAG-linked rows do not collide with each other.
--
-- Background
-- ----------
-- Migration `20260406200000_orchestration_steps.sql` created
--   CREATE UNIQUE INDEX idx_orch_steps_idempotent
--     ON orchestration_steps(event_id, attempt, step_type);
--
-- That works for the Phase 3N (single-step-per-event) world. Phase 4N-a
-- introduced DAGs where many nodes are linked to the SAME root event:
-- the IncrementalScheduler enqueues every leaf with
--   eventId   = dag.root_event_id ?? dag.id
--   attempt   = 0
--   stepType  = node.step_type
-- so two leaf nodes with `step_type='outbound'` under the same DAG
-- would tuple-collide and the second insert would fail with 23505.
--
-- Phase 4N-a's `20260407220100_orchestration_steps_dag_columns.sql`
-- already added a stronger DAG-scoped unique index
--   CREATE UNIQUE INDEX idx_orch_steps_dag_attempt
--     ON orchestration_steps(dag_id, dag_node_id, attempt)
--     WHERE dag_id IS NOT NULL;
-- but it left the legacy index unconditional, so DAG rows were still
-- being checked against (event_id, attempt, step_type).
--
-- Fix
-- ---
-- Replace the legacy index with a partial one that only covers non-DAG
-- rows. DAG rows are now governed exclusively by `idx_orch_steps_dag_attempt`.
-- Both indexes together preserve idempotency for every code path:
--
--   * Non-DAG rows (Phase 3N step pipeline) — `idx_orch_steps_idempotent`
--     remains unique on (event_id, attempt, step_type).
--   * DAG rows (Phase 4N-a) — `idx_orch_steps_dag_attempt` is unique on
--     (dag_id, dag_node_id, attempt).
--
-- Conflict resolution in `insertOrchestrationStep()` (contracts/dag-step.ts)
-- selects on the appropriate key based on whether `dag_id` was provided.

DROP INDEX IF EXISTS idx_orch_steps_idempotent;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_steps_idempotent
  ON orchestration_steps(event_id, attempt, step_type)
  WHERE dag_id IS NULL;
