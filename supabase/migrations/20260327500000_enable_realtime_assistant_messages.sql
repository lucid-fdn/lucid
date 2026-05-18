-- Enable Supabase Realtime on assistant_messages so the web chat UI
-- can receive scheduled task outputs and cross-agent messages without refresh.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'assistant_messages'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'assistant_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE assistant_messages;
  END IF;
END $$;
