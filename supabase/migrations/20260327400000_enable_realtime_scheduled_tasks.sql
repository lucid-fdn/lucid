-- Enable Realtime for agent_scheduled_tasks.
-- Without this, Supabase postgres_changes subscriptions on this table
-- silently receive no events, forcing clients to rely on polling only.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'agent_scheduled_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agent_scheduled_tasks;
  END IF;
END $$;
