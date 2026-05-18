-- OAuth tool call audit trail
-- Durable structured records for every OAuth tool invocation.
-- Enables: usage analytics, billing, abuse detection, debugging.

CREATE TABLE IF NOT EXISTS oauth_audit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id    UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  run_id          TEXT NOT NULL,
  provider        TEXT NOT NULL,
  action          TEXT NOT NULL,
  connection_id   TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('success', 'error', 'gated', 'denied')),
  error_code      TEXT,
  args_summary    JSONB DEFAULT '{}'::jsonb,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query patterns: by assistant, by provider, by time range
CREATE INDEX idx_oauth_audit_assistant_created
  ON oauth_audit_events (assistant_id, created_at DESC);

CREATE INDEX idx_oauth_audit_provider_created
  ON oauth_audit_events (provider, created_at DESC);

-- RPC for fire-and-forget audit insertion from worker
CREATE OR REPLACE FUNCTION insert_oauth_audit_event(
  p_assistant_id    UUID,
  p_run_id          TEXT,
  p_provider        TEXT,
  p_action          TEXT,
  p_connection_id   TEXT,
  p_status          TEXT,
  p_error_code      TEXT DEFAULT NULL,
  p_args_summary    JSONB DEFAULT '{}'::jsonb,
  p_duration_ms     INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO oauth_audit_events (
    assistant_id, run_id, provider, action, connection_id,
    status, error_code, args_summary, duration_ms
  ) VALUES (
    p_assistant_id, p_run_id, p_provider, p_action, p_connection_id,
    p_status, p_error_code, p_args_summary, p_duration_ms
  );
END;
$$;

-- RLS: org members can read audit events for their assistants
ALTER TABLE oauth_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view audit events"
  ON oauth_audit_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM ai_assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE a.id = oauth_audit_events.assistant_id
        AND om.user_id = auth.uid()
    )
  );
