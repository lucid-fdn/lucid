-- Reconstructed from remote supabase_migrations.schema_migrations on 2026-04-30T15:42:40.755Z.

-- Remote migration version: 20260429231000

-- Remote migration name: agent_ops_notification_fanout



ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS severity TEXT,
  ADD COLUMN IF NOT EXISTS href TEXT,
  ADD COLUMN IF NOT EXISTS link TEXT,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS related_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_asset_id UUID,
  ADD COLUMN IF NOT EXISTS related_org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'info',
    'success',
    'warning',
    'error',
    'NEW_FOLLOWER',
    'ASSET_LIKED',
    'ASSET_RATED',
    'ASSET_PUBLISHED',
    'MENTION',
    'WORKFLOW_EXECUTED',
    'WORKFLOW_FAILED',
    'AGENT_OPS_PERFORMANCE_ALERT',
    'IMPORTANT_UPDATE'
  ));

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_severity_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_severity_check CHECK (severity IS NULL OR severity IN (
    'info',
    'success',
    'warning',
    'error'
  ));

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_metadata_object;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_metadata_object CHECK (jsonb_typeof(metadata) = 'object');

CREATE INDEX IF NOT EXISTS idx_notifications_user_org_created
  ON notifications(user_id, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_related_org_created
  ON notifications(related_org_id, created_at DESC)
  WHERE related_org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_agent_ops_perf_alert_fingerprint
  ON notifications(user_id, type, ((metadata->>'fingerprint')))
  WHERE type = 'AGENT_OPS_PERFORMANCE_ALERT'
    AND metadata ? 'fingerprint';
