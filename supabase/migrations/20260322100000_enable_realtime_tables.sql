-- Enable Supabase Realtime on Mission Control tables (idempotent).
-- These tables publish postgres_changes events via WebSocket.
-- RLS is enforced per-client using custom JWTs minted by
-- /api/mission-control/realtime-token (bridges Privy auth → Supabase Realtime).

DO $$
BEGIN
  -- Only add tables that aren't already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'assistant_inbound_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE assistant_inbound_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'assistant_outbound_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE assistant_outbound_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mc_pending_approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_pending_approvals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ai_assistants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_assistants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mc_agent_health_scores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_agent_health_scores;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mc_remediation_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_remediation_log;
  END IF;
END $$;
