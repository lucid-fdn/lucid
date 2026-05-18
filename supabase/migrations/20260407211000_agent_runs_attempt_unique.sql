-- Pulse: agent_runs per-attempt uniqueness
--
-- Phase 2N-hardening follow-up (Codex review #12 finalization).
--
-- The original 20260403100000_pulse_agent_runs.sql shipped with a
-- non-unique index on (event_id, event_type) per Review 2 #12, which
-- was described as "prevents duplicate runs" but was never actually
-- enforced. In practice the worker + control plane insert one row per
-- ATTEMPT via recordClaim(), and recordComplete/Fail update the row
-- matching attempt = job.attempt + 1. That works correctly today — but
-- nothing prevents an accidental double-insert for the same attempt
-- (e.g. push path + sweep path both claiming the same runId before
-- ZADD NX dedup kicks in).
--
-- This migration adds a proper UNIQUE constraint on the attempt-scoped
-- key so double-inserts fail fast at the DB layer (silently caught by
-- the fire-and-forget .catch(() => {}) in agent-runs.ts and claim-proxy).
-- Retries still create new rows because `attempt` is part of the key.

-- Drop the old non-unique index (replaced by the unique index below).
DROP INDEX IF EXISTS idx_agent_runs_event;

-- Per-attempt uniqueness: one row per (event_id, event_type, attempt).
-- Retries get a new row because attempt is part of the key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_event_attempt
  ON agent_runs(event_id, event_type, attempt);
