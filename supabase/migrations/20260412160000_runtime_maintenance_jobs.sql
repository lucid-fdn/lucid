-- Provider-agnostic maintenance metadata and job audit trail for managed runtimes.

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS managed_by_lucid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maintenance_channel TEXT NOT NULL DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS auto_update_policy TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS current_image_ref TEXT,
  ADD COLUMN IF NOT EXISTS current_image_digest TEXT,
  ADD COLUMN IF NOT EXISTS target_image_ref TEXT,
  ADD COLUMN IF NOT EXISTS last_successful_image_ref TEXT,
  ADD COLUMN IF NOT EXISTS last_maintenance_action TEXT,
  ADD COLUMN IF NOT EXISTS last_maintenance_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_maintenance_error TEXT;

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_maintenance_channel_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_maintenance_channel_check
  CHECK (maintenance_channel IN ('stable', 'canary', 'pinned'));

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_auto_update_policy_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_auto_update_policy_check
  CHECK (auto_update_policy IN ('manual', 'patch_auto', 'security_auto', 'full_auto'));

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_last_maintenance_action_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_last_maintenance_action_check
  CHECK (
    last_maintenance_action IS NULL
    OR last_maintenance_action IN ('redeploy', 'restart', 'rollback')
  );

UPDATE dedicated_runtimes
SET managed_by_lucid = TRUE
WHERE managed_by_lucid = FALSE
  AND (l2_passport_id IS NOT NULL OR l2_deployment_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS runtime_maintenance_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runtime_id UUID NOT NULL REFERENCES dedicated_runtimes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  target_image_ref TEXT,
  target_image_digest TEXT,
  provider_operation_id TEXT,
  provider_deployment_id TEXT,
  requested_by UUID,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE runtime_maintenance_jobs
  DROP CONSTRAINT IF EXISTS runtime_maintenance_jobs_action_check;

ALTER TABLE runtime_maintenance_jobs
  ADD CONSTRAINT runtime_maintenance_jobs_action_check
  CHECK (action IN ('redeploy', 'restart', 'rollback'));

ALTER TABLE runtime_maintenance_jobs
  DROP CONSTRAINT IF EXISTS runtime_maintenance_jobs_status_check;

ALTER TABLE runtime_maintenance_jobs
  ADD CONSTRAINT runtime_maintenance_jobs_status_check
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));

CREATE INDEX IF NOT EXISTS idx_runtime_maintenance_jobs_runtime_created
  ON runtime_maintenance_jobs (runtime_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_maintenance_jobs_org_created
  ON runtime_maintenance_jobs (org_id, created_at DESC);
