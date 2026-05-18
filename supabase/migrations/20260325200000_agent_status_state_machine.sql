-- Migration: Expand mc_status to support full state machine
-- States: active, paused, stopped, failed
--
-- Transition rules (enforced in application layer):
--   active  → paused, stopped, failed
--   paused  → active, stopped
--   stopped → active
--   failed  → active, stopped

-- 1. Drop old CHECK constraint and add expanded one
ALTER TABLE ai_assistants
  DROP CONSTRAINT IF EXISTS ai_assistants_mc_status_check;

ALTER TABLE ai_assistants
  ADD CONSTRAINT ai_assistants_mc_status_check
  CHECK (mc_status IN ('active', 'paused', 'stopped', 'failed'));

-- 2. Update comment
COMMENT ON COLUMN ai_assistants.mc_status IS 'Mission Control status: active, paused, stopped, or failed. Transitions enforced in application layer.';
