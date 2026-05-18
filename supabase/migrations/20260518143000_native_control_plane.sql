-- Native app control plane receipts and handoff audit.
-- Official desktop/mobile apps use these tables for device-bound sessions,
-- action receipts, voice/share command traces, and approval/run mutations.

CREATE TABLE IF NOT EXISTS native_session_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'privy',
  app_kind TEXT NOT NULL CHECK (app_kind IN ('desktop', 'mobile', 'pwa')),
  platform TEXT NOT NULL CHECK (platform IN ('macos', 'windows', 'linux', 'ios', 'android', 'web')),
  install_id TEXT NOT NULL,
  return_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS native_session_handoffs_user_idx
  ON native_session_handoffs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS native_action_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES native_devices(id) ON DELETE SET NULL,
  feature_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'completed', 'rejected', 'requires-confirmation')),
  confirmation_method TEXT,
  confirmation_receipt TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS native_action_receipts_user_created_idx
  ON native_action_receipts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS native_command_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES native_devices(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('voice', 'share', 'shortcut', 'notification-action', 'desktop-ipc')),
  intent TEXT,
  interpreted_command TEXT,
  risk TEXT CHECK (risk IN ('passive', 'user-initiated', 'confirmation-required', 'privileged')),
  requires_confirmation BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS native_command_events_user_created_idx
  ON native_command_events (user_id, created_at DESC);

ALTER TABLE native_session_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_action_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_command_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS native_session_handoffs_select_own ON native_session_handoffs;
CREATE POLICY native_session_handoffs_select_own
  ON native_session_handoffs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS native_action_receipts_select_own ON native_action_receipts;
CREATE POLICY native_action_receipts_select_own
  ON native_action_receipts
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS native_command_events_select_own ON native_command_events;
CREATE POLICY native_command_events_select_own
  ON native_command_events
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE native_action_receipts IS 'Device-bound audit receipts for native approvals, run controls, voice commands, shares, shortcuts, and notification actions.';
COMMENT ON TABLE native_command_events IS 'Auditable native command intake events before execution or confirmation.';

