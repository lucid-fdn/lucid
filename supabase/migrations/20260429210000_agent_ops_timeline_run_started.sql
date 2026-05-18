-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.754Z.

-- Remote migration version: 20260429210000

-- Remote migration name: agent_ops_timeline_run_started



ALTER TABLE project_timeline_events
  DROP CONSTRAINT IF EXISTS project_timeline_events_event_type_check;

ALTER TABLE project_timeline_events
  ADD CONSTRAINT project_timeline_events_event_type_check CHECK (event_type IN (
    'agent_ops_run_started',
    'learning_created',
    'learning_superseded',
    'decision_recorded',
    'eval_completed',
    'release_shipped',
    'incident_investigated',
    'retro_completed'
  ));
