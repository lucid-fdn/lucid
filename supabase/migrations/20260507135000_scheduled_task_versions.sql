CREATE TABLE IF NOT EXISTS agent_scheduled_task_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES agent_scheduled_tasks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'cancelled', 'deleted', 'restored')),
  summary TEXT,
  snapshot JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  restored_from_version_id UUID REFERENCES agent_scheduled_task_versions(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agent_scheduled_task_versions_snapshot_object CHECK (jsonb_typeof(snapshot) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_scheduled_task_versions_task_version
  ON agent_scheduled_task_versions(task_id, version);

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_task_versions_org
  ON agent_scheduled_task_versions(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_scheduled_task_versions_task
  ON agent_scheduled_task_versions(task_id, created_at DESC);

ALTER TABLE agent_scheduled_task_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_scheduled_task_versions_org_select
  ON agent_scheduled_task_versions
  FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY agent_scheduled_task_versions_service_all
  ON agent_scheduled_task_versions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
