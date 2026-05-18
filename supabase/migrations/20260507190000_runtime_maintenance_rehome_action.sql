-- Allow operator-safe runtime re-home jobs and env-only reconciliation jobs.

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_last_maintenance_action_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_last_maintenance_action_check
  CHECK (
    last_maintenance_action IS NULL
    OR last_maintenance_action IN ('reconcile', 'redeploy', 'restart', 'rollback', 'rehome')
  );

ALTER TABLE runtime_maintenance_jobs
  DROP CONSTRAINT IF EXISTS runtime_maintenance_jobs_action_check;

ALTER TABLE runtime_maintenance_jobs
  ADD CONSTRAINT runtime_maintenance_jobs_action_check
  CHECK (action IN ('reconcile', 'redeploy', 'restart', 'rollback', 'rehome'));
