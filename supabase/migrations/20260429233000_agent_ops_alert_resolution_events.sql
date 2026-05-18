-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.756Z.

-- Remote migration version: 20260429233000

-- Remote migration name: agent_ops_alert_resolution_events



ALTER TABLE project_timeline_events
  DROP CONSTRAINT IF EXISTS project_timeline_events_event_type_check;

ALTER TABLE project_timeline_events
  ADD CONSTRAINT project_timeline_events_event_type_check CHECK (event_type IN (
    'agent_ops_run_started',
    'agent_ops_performance_alert',
    'agent_ops_performance_alert_resolved',
    'learning_created',
    'learning_superseded',
    'decision_recorded',
    'eval_completed',
    'release_shipped',
    'incident_investigated',
    'retro_completed'
  ));

CREATE INDEX IF NOT EXISTS idx_project_timeline_events_agent_ops_perf_alert_resolution
  ON project_timeline_events(org_id, project_id, created_at DESC)
  WHERE event_type = 'agent_ops_performance_alert_resolved';
