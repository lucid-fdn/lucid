-- Native desktop/mobile device registration, revocation, and deep-link audit events.

CREATE TABLE IF NOT EXISTS native_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('macos', 'windows', 'linux', 'ios', 'android', 'web')),
  app_kind TEXT NOT NULL CHECK (app_kind IN ('desktop', 'mobile', 'pwa')),
  install_id TEXT NOT NULL,
  device_name TEXT,
  app_version TEXT,
  os_version TEXT,
  push_provider TEXT CHECK (push_provider IN ('expo', 'apns', 'fcm', 'desktop-local')),
  push_token_hash TEXT,
  push_token_encrypted TEXT,
  notification_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, app_kind, install_id)
);

CREATE INDEX IF NOT EXISTS native_devices_user_seen_idx
  ON native_devices (user_id, last_seen_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS native_devices_org_idx
  ON native_devices (org_id)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS native_devices_push_hash_idx
  ON native_devices (push_token_hash)
  WHERE push_token_hash IS NOT NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS native_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES native_devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS native_auth_sessions_user_device_idx
  ON native_auth_sessions (user_id, device_id, revoked_at);

CREATE TABLE IF NOT EXISTS native_deep_link_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id UUID REFERENCES native_devices(id) ON DELETE SET NULL,
  app_kind TEXT NOT NULL CHECK (app_kind IN ('desktop', 'mobile', 'pwa')),
  raw_url TEXT NOT NULL,
  resolved_path TEXT,
  status TEXT NOT NULL CHECK (status IN ('resolved', 'rejected', 'not_found')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS native_deep_link_events_user_created_idx
  ON native_deep_link_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_native_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_native_devices_updated_at ON native_devices;
CREATE TRIGGER touch_native_devices_updated_at
  BEFORE UPDATE ON native_devices
  FOR EACH ROW EXECUTE FUNCTION public.touch_native_devices_updated_at();

ALTER TABLE native_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_deep_link_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS native_devices_select_own ON native_devices;
CREATE POLICY native_devices_select_own
  ON native_devices
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS native_devices_insert_own ON native_devices;
CREATE POLICY native_devices_insert_own
  ON native_devices
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS native_devices_update_own ON native_devices;
CREATE POLICY native_devices_update_own
  ON native_devices
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS native_deep_link_events_select_own ON native_deep_link_events;
CREATE POLICY native_deep_link_events_select_own
  ON native_deep_link_events
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS native_deep_link_events_insert_own ON native_deep_link_events;
CREATE POLICY native_deep_link_events_insert_own
  ON native_deep_link_events
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()) OR user_id IS NULL);

COMMENT ON TABLE native_devices IS 'Revocable native desktop/mobile/PWA installations. Push token material is hashed and encrypted only.';
COMMENT ON TABLE native_auth_sessions IS 'Revocable native bearer/refresh sessions scoped to users and devices.';
COMMENT ON TABLE native_deep_link_events IS 'Audit trail for native deep-link resolution and rejection events.';
