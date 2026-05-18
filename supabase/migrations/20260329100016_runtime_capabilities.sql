-- Runtime capabilities: env_snapshot (metadata-only), healthcheck_config, restart_policy
-- These columns store last-known-applied config for UI convenience.
-- L2/provider is source of truth for actual running state.

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS env_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS healthcheck_config JSONB,
  ADD COLUMN IF NOT EXISTS restart_policy TEXT DEFAULT 'always'
    CHECK (restart_policy IN ('always', 'on_failure', 'never'));

COMMENT ON COLUMN dedicated_runtimes.env_snapshot IS 'Metadata only — never stores raw secret values. Keys + masked indicators.';
COMMENT ON COLUMN dedicated_runtimes.healthcheck_config IS 'Last known applied healthcheck config {path, intervalSeconds, timeoutSeconds}.';
COMMENT ON COLUMN dedicated_runtimes.restart_policy IS 'Last known restart policy: always, on_failure, or never.';
