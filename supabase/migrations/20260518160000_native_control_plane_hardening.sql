-- Durable native app control-plane state.
-- This promotes Approval Wallet, Live Run Control, Share To Lucid, and native
-- run timelines from beta/dev in-memory state to auditable Supabase state.

CREATE TABLE IF NOT EXISTS native_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workspace_id UUID,
  project_id UUID,
  title TEXT NOT NULL,
  agent_name TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'blocked', 'completed', 'failed', 'cancelled')),
  progress INTEGER CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
  needs_approval BOOLEAN NOT NULL DEFAULT false,
  deep_link TEXT,
  source_kind TEXT CHECK (source_kind IN ('share', 'voice', 'shortcut', 'notification-action', 'agent-run', 'manual')),
  source_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS native_runs_user_updated_idx
  ON native_runs (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS native_runs_user_attention_idx
  ON native_runs (user_id, status, needs_approval, updated_at DESC)
  WHERE status IN ('running', 'paused', 'blocked', 'queued') OR needs_approval = true;

CREATE TABLE IF NOT EXISTS native_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workspace_id UUID,
  project_id UUID,
  run_id TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  agent_name TEXT,
  risk TEXT NOT NULL CHECK (risk IN ('confirmation-required', 'privileged')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  expires_at TIMESTAMPTZ,
  deep_link TEXT,
  source_kind TEXT CHECK (source_kind IN ('agent-run', 'voice', 'shortcut', 'notification-action', 'manual')),
  source_id TEXT,
  decision_reason TEXT,
  decided_by_device_id UUID REFERENCES native_devices(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS native_approvals_user_created_idx
  ON native_approvals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS native_approvals_user_pending_idx
  ON native_approvals (user_id, expires_at ASC NULLS LAST, created_at DESC)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS native_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES native_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  body TEXT,
  actor TEXT,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'success', 'warning', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS native_run_events_run_at_idx
  ON native_run_events (run_id, at DESC);

CREATE INDEX IF NOT EXISTS native_run_events_user_at_idx
  ON native_run_events (user_id, at DESC);

CREATE OR REPLACE FUNCTION public.touch_native_control_plane_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_native_runs_updated_at ON native_runs;
CREATE TRIGGER touch_native_runs_updated_at
  BEFORE UPDATE ON native_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_native_control_plane_updated_at();

DROP TRIGGER IF EXISTS touch_native_approvals_updated_at ON native_approvals;
CREATE TRIGGER touch_native_approvals_updated_at
  BEFORE UPDATE ON native_approvals
  FOR EACH ROW EXECUTE FUNCTION public.touch_native_control_plane_updated_at();

ALTER TABLE native_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS native_runs_select_own ON native_runs;
CREATE POLICY native_runs_select_own
  ON native_runs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS native_approvals_select_own ON native_approvals;
CREATE POLICY native_approvals_select_own
  ON native_approvals
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS native_run_events_select_own ON native_run_events;
CREATE POLICY native_run_events_select_own
  ON native_run_events
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE native_runs IS 'Durable desktop/mobile Live Run Control rows shown in native apps.';
COMMENT ON TABLE native_approvals IS 'Durable Approval Wallet rows with decision metadata and device confirmation context.';
COMMENT ON TABLE native_run_events IS 'Native run timeline events for mobile and desktop run detail screens.';
