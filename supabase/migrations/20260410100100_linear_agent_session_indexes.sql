-- Performance indexes for linear_agent_sessions based on Phase 1-3 query patterns.
-- Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 4

CREATE INDEX IF NOT EXISTS idx_linear_sessions_agent
  ON linear_agent_sessions(agent_id, status)
  WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_linear_sessions_run
  ON linear_agent_sessions(run_id)
  WHERE run_id IS NOT NULL;
