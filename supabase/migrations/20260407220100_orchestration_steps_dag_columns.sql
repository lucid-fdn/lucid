-- Phase 4N-a, Task 17: Extend orchestration_steps with DAG linkage
--
-- See docs/superpowers/specs/2026-04-06-nerve-dag-planner-design.md §3.7.
--
-- Adds the columns needed to bind step rows to DAG nodes (Phase 4N) and
-- strengthens the idempotency constraint so one DAG node can only have
-- one step row per attempt. The existing Phase 3N unique index on
-- (event_id, attempt, step_type) is kept for non-DAG rows.

ALTER TABLE orchestration_steps
  ADD COLUMN IF NOT EXISTS dag_id UUID REFERENCES orchestration_dags(id),
  ADD COLUMN IF NOT EXISTS dag_node_id UUID REFERENCES orchestration_dag_nodes(id),
  ADD COLUMN IF NOT EXISTS runtime_target TEXT,
  ADD COLUMN IF NOT EXISTS route_class TEXT,
  ADD COLUMN IF NOT EXISTS replay_of_step_id UUID REFERENCES orchestration_steps(id);

CREATE INDEX IF NOT EXISTS idx_orch_steps_dag
  ON orchestration_steps(dag_id)
  WHERE dag_id IS NOT NULL;

-- Strengthened idempotency for DAG-linked rows: one step per (dag, node, attempt).
-- Non-DAG rows are covered by the existing idx_orch_steps_idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_steps_dag_attempt
  ON orchestration_steps(dag_id, dag_node_id, attempt)
  WHERE dag_id IS NOT NULL;
