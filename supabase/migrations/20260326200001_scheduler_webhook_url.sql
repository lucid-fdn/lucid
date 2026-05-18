-- =============================================================================
-- Migration: Add webhook_url to agent_scheduled_tasks
--
-- Enables scheduled tasks to POST their output to an external URL
-- on completion (fire-and-forget webhook delivery).
-- =============================================================================

ALTER TABLE agent_scheduled_tasks
  ADD COLUMN IF NOT EXISTS webhook_url TEXT DEFAULT NULL;

-- Validate HTTPS-only at app level (scheduler.ts), not DB constraint,
-- to allow flexibility for internal URLs in development.
COMMENT ON COLUMN agent_scheduled_tasks.webhook_url IS 'Optional HTTPS URL to POST task output on completion';
