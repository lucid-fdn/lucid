-- Routine Kernel
--
-- Keeps `agent_scheduled_tasks` as the canonical scheduled-work definition
-- table while adding engine/runtime-agnostic target, policy, and receipt
-- fields. Pulse remains the admission/execution plane.

ALTER TABLE agent_scheduled_tasks
  ADD COLUMN IF NOT EXISTS task_kind TEXT NOT NULL DEFAULT 'assistant_run',
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'assistant',
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES crews(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_item_id UUID,
  ADD COLUMN IF NOT EXISTS trigger_kind TEXT NOT NULL DEFAULT 'cron',
  ADD COLUMN IF NOT EXISTS trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS concurrency_policy TEXT NOT NULL DEFAULT 'skip_if_running',
  ADD COLUMN IF NOT EXISTS catch_up_policy TEXT NOT NULL DEFAULT 'latest_only',
  ADD COLUMN IF NOT EXISTS catch_up_limit INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS budget_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS runtime_selector JSONB NOT NULL DEFAULT '{"nativeScheduler":"disabled"}'::jsonb,
  ADD COLUMN IF NOT EXISTS capability_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS context_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trustgate_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS team_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dispatch_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS managed_resource_id UUID,
  ADD COLUMN IF NOT EXISTS last_run_status TEXT,
  ADD COLUMN IF NOT EXISTS next_fire_preview JSONB,
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE agent_scheduled_tasks
  DROP CONSTRAINT IF EXISTS agent_scheduled_tasks_task_kind_check,
  ADD CONSTRAINT agent_scheduled_tasks_task_kind_check
    CHECK (task_kind IN (
      'assistant_run',
      'team_run',
      'work_graph_action',
      'agent_ops_run',
      'browser_procedure_run',
      'knowledge_job',
      'engine_home_job',
      'plugin_job',
      'pm_sync'
    ));

ALTER TABLE agent_scheduled_tasks
  DROP CONSTRAINT IF EXISTS agent_scheduled_tasks_target_type_check,
  ADD CONSTRAINT agent_scheduled_tasks_target_type_check
    CHECK (target_type IN (
      'assistant',
      'team',
      'work_graph',
      'agent_ops',
      'browser_procedure',
      'knowledge',
      'engine_home',
      'plugin_job',
      'pm_sync'
    ));

ALTER TABLE agent_scheduled_tasks
  DROP CONSTRAINT IF EXISTS agent_scheduled_tasks_trigger_kind_check,
  ADD CONSTRAINT agent_scheduled_tasks_trigger_kind_check
    CHECK (trigger_kind IN ('cron', 'one_shot', 'manual', 'event', 'webhook', 'pm_sync'));

ALTER TABLE agent_scheduled_tasks
  DROP CONSTRAINT IF EXISTS agent_scheduled_tasks_concurrency_policy_check,
  ADD CONSTRAINT agent_scheduled_tasks_concurrency_policy_check
    CHECK (concurrency_policy IN ('skip_if_running', 'queue_one', 'parallel', 'replace'));

ALTER TABLE agent_scheduled_tasks
  DROP CONSTRAINT IF EXISTS agent_scheduled_tasks_catch_up_policy_check,
  ADD CONSTRAINT agent_scheduled_tasks_catch_up_policy_check
    CHECK (catch_up_policy IN ('none', 'latest_only', 'bounded', 'all'));

ALTER TABLE agent_scheduled_tasks
  DROP CONSTRAINT IF EXISTS agent_scheduled_tasks_source_kind_check,
  ADD CONSTRAINT agent_scheduled_tasks_source_kind_check
    CHECK (source_kind IN ('manual', 'agent_tool', 'template', 'pack', 'agent_ops', 'work_graph', 'system', 'import'));

ALTER TABLE agent_scheduled_tasks
  DROP CONSTRAINT IF EXISTS agent_scheduled_tasks_last_run_status_check,
  ADD CONSTRAINT agent_scheduled_tasks_last_run_status_check
    CHECK (last_run_status IS NULL OR last_run_status IN (
      'queued',
      'claimed',
      'running',
      'succeeded',
      'failed',
      'dead_letter',
      'cancelled',
      'skipped'
    ));

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_tasks_routine_active_due
  ON agent_scheduled_tasks(org_id, next_run_at)
  WHERE enabled = true AND status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_tasks_routine_target
  ON agent_scheduled_tasks(org_id, target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_tasks_routine_team
  ON agent_scheduled_tasks(org_id, team_id, created_at DESC)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_tasks_routine_project
  ON agent_scheduled_tasks(org_id, project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_scheduled_task_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES agent_scheduled_tasks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  team_id UUID REFERENCES crews(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  routine_run_id UUID NOT NULL DEFAULT gen_random_uuid(),
  scheduled_for TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled', 'skipped')),
  attempt INTEGER NOT NULL DEFAULT 1,
  run_id UUID,
  target_type TEXT NOT NULL DEFAULT 'assistant',
  target_id UUID,
  task_kind TEXT NOT NULL DEFAULT 'assistant_run',
  pulse_event_id UUID,
  crew_run_id UUID REFERENCES crew_runs(id) ON DELETE SET NULL,
  agent_ops_run_id UUID,
  browser_run_id UUID,
  engine_home_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  work_graph_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  knowledge_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  trustgate_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  dispatch_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary TEXT,
  error_message TEXT,
  sanitized_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_scheduled_task_runs_task_scheduled_for
  ON agent_scheduled_task_runs(task_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_task_runs_org_created
  ON agent_scheduled_task_runs(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_task_runs_task_created
  ON agent_scheduled_task_runs(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_task_runs_target
  ON agent_scheduled_task_runs(org_id, target_type, target_id, created_at DESC);

ALTER TABLE agent_scheduled_task_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_scheduled_task_runs'
      AND policyname = 'agent_scheduled_task_runs_org_select'
  ) THEN
    CREATE POLICY agent_scheduled_task_runs_org_select
      ON agent_scheduled_task_runs
      FOR SELECT TO authenticated
      USING (org_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = (SELECT auth.uid())
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_scheduled_task_runs'
      AND policyname = 'agent_scheduled_task_runs_service_all'
  ) THEN
    CREATE POLICY agent_scheduled_task_runs_service_all
      ON agent_scheduled_task_runs
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE agent_scheduled_task_runs IS
  'Routine run receipt ledger. Domain systems keep their own ledgers; this table stores cross-domain refs, status, and sanitized evidence for Routine UX/audit.';
