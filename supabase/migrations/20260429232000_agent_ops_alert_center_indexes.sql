-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.756Z.

-- Remote migration version: 20260429232000

-- Remote migration name: agent_ops_alert_center_indexes



CREATE INDEX IF NOT EXISTS idx_project_timeline_events_agent_ops_perf_alert_project_created
  ON project_timeline_events(org_id, project_id, created_at DESC)
  WHERE event_type = 'agent_ops_performance_alert';

CREATE INDEX IF NOT EXISTS idx_project_timeline_events_agent_ops_perf_alert_assistant
  ON project_timeline_events USING gin (metadata jsonb_path_ops)
  WHERE event_type = 'agent_ops_performance_alert';
