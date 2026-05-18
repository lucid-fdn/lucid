-- ============================================================================
-- Migration 013: Workflow Schedule System
-- Description: Add cron-based scheduling for workflows
-- Version: 1.0
-- Date: 2025-01-17
-- ============================================================================

-- Create schedules table
CREATE TABLE IF NOT EXISTS workflow_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'error', 'skipped')),
  last_run_error TEXT,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_schedules_workflow ON workflow_schedules(workflow_id);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON workflow_schedules(next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON workflow_schedules(enabled);

-- Create schedule execution logs table
CREATE TABLE IF NOT EXISTS schedule_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES workflow_schedules(id) ON DELETE CASCADE,
  workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  error TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for logs
CREATE INDEX IF NOT EXISTS idx_schedule_logs_schedule ON schedule_execution_logs(schedule_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_logs_execution ON schedule_execution_logs(workflow_execution_id);

-- Enable RLS
ALTER TABLE workflow_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_execution_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_schedules
-- Users can view schedules for workflows in their organizations
CREATE POLICY "Users can view schedules in their orgs"
  ON workflow_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workflows w
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workflow_schedules.workflow_id
      AND om.user_id = auth.uid()
    )
  );

-- Users can create schedules for workflows in their orgs (editor+ role)
CREATE POLICY "Editors can create schedules"
  ON workflow_schedules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workflows w
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workflow_schedules.workflow_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'developer')
    )
  );

-- Users can update schedules in their orgs (editor+ role)
CREATE POLICY "Editors can update schedules"
  ON workflow_schedules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workflows w
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workflow_schedules.workflow_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'developer')
    )
  );

-- Users can delete schedules in their orgs (editor+ role)
CREATE POLICY "Editors can delete schedules"
  ON workflow_schedules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workflows w
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workflow_schedules.workflow_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'developer')
    )
  );

-- RLS Policies for schedule_execution_logs
-- Users can view logs for schedules in their workflows
CREATE POLICY "Users can view schedule logs in their orgs"
  ON schedule_execution_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workflow_schedules ws
      INNER JOIN workflows w ON w.id = ws.workflow_id
      INNER JOIN organization_members om ON om.organization_id = w.organization_id
      WHERE ws.id = schedule_execution_logs.schedule_id
      AND om.user_id = auth.uid()
    )
  );

-- Service role can insert logs (from scheduler)
CREATE POLICY "Service role can insert logs"
  ON schedule_execution_logs FOR INSERT
  WITH CHECK (true);

-- Create function to update next_run_at based on cron expression
CREATE OR REPLACE FUNCTION calculate_next_run(
  cron_expr TEXT,
  tz TEXT DEFAULT 'UTC',
  from_time TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  next_run TIMESTAMPTZ;
BEGIN
  -- This is a placeholder - in production, use pg_cron or external service
  -- For now, return next hour as fallback
  next_run := date_trunc('hour', from_time) + interval '1 hour';
  RETURN next_run;
END;
$$;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER schedule_updated_at
  BEFORE UPDATE ON workflow_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_updated_at();

-- Create trigger to calculate next_run_at on insert/update
CREATE OR REPLACE FUNCTION update_schedule_next_run()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enabled = true THEN
    NEW.next_run_at := calculate_next_run(
      NEW.cron_expression,
      NEW.timezone,
      COALESCE(NEW.last_run_at, now())
    );
  ELSE
    NEW.next_run_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER schedule_next_run
  BEFORE INSERT OR UPDATE ON workflow_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_next_run();

-- Add comment
COMMENT ON TABLE workflow_schedules IS 'Stores cron-based schedules for workflow automation';
COMMENT ON TABLE schedule_execution_logs IS 'Logs each scheduled execution attempt';
