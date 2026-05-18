-- ============================================================================
-- Migration 052: Org LucidGateway key audit events
--
-- Purpose:
-- - Maintain append-only audit records for LucidGateway key lifecycle actions
-- - Capture actor, event type, and metadata for traceability / compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_lucidgateway_key_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_id UUID REFERENCES org_lucidgateway_keys(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'created',
      'revoked',
      'rotated',
      'rotation_started',
      'rotation_completed',
      'rotation_failed',
      'error'
    )
  ),
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_lucidgateway_key_audit_org_created
  ON org_lucidgateway_key_audit_events(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_lucidgateway_key_audit_key_created
  ON org_lucidgateway_key_audit_events(key_id, created_at DESC)
  WHERE key_id IS NOT NULL;

ALTER TABLE org_lucidgateway_key_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org key audit events in their org"
  ON org_lucidgateway_key_audit_events
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org owners/admins can insert org key audit events"
  ON org_lucidgateway_key_audit_events
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

GRANT SELECT, INSERT ON org_lucidgateway_key_audit_events TO service_role;
