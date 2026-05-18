-- Phase 4N-0, Task 14: Orchestration steps — orphan detection index.
--
-- The unique idempotency constraint on (event_id, attempt, step_type)
-- already exists from 20260406200000_orchestration_steps.sql:41, and
-- event_id is NOT NULL — no reinforcement needed.
--
-- This migration only adds the partial index that supports the orphan
-- detector's stuck-step recovery query (Phase 4N-0, Task 6):
--
--     UPDATE orchestration_steps
--     SET status = 'pending', attempt = attempt + 1,
--         error_message = 'orphaned-by-detector'
--     WHERE status = 'claimed'
--       AND started_at < NOW() - INTERVAL '2 minutes'
--     RETURNING id, dag_node_id, event_id, run_id;
--
-- Without the partial index, the detector would seq-scan the table on
-- every tick (every 60s). With it, only rows with status='claimed' are
-- walked, ordered by started_at — the orphan set is always a tiny tail.
--
-- NOTE: The migration slot originally specified in the plan
-- (20260407100000) was already taken by telegram_multi_agent.sql. Moved
-- to 20260407120000 (next free slot in the 2026-04-07 range).

CREATE INDEX IF NOT EXISTS idx_orch_steps_stuck_claimed
  ON orchestration_steps(started_at)
  WHERE status = 'claimed';
