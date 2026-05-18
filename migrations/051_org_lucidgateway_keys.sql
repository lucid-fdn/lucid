-- ============================================================================
-- Migration 051: Organization-scoped LucidGateway virtual key management
--
-- Purpose:
-- - Store one or more LucidGateway virtual keys per organization/customer
-- - Keep raw virtual keys encrypted at rest via encrypted_secrets
-- - Support rotation/revocation metadata and tenant-safe access controls
-- ============================================================================

-- Shared helper dependency (present in newer stacks via migration 044).
-- Re-declare safely here so fresh/partial environments can run 051 independently.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS org_lucidgateway_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  provider TEXT NOT NULL DEFAULT 'lucidgateway',
  key_alias TEXT NOT NULL,
  lucidgateway_key_id TEXT,
  key_preview TEXT NOT NULL,

  encrypted_secrets_id UUID REFERENCES encrypted_secrets(id) ON DELETE SET NULL,

  rpm_limit INTEGER,
  tpm_limit INTEGER,
  max_budget NUMERIC(12, 2),
  budget_duration TEXT,
  models TEXT[] NOT NULL DEFAULT '{}',

  is_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'rotated', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rotated_from_key_id UUID REFERENCES org_lucidgateway_keys(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_lucidgateway_keys_org_active
  ON org_lucidgateway_keys(org_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_lucidgateway_keys_lucidgateway_key_id
  ON org_lucidgateway_keys(lucidgateway_key_id)
  WHERE lucidgateway_key_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_lucidgateway_active_alias
  ON org_lucidgateway_keys(org_id, key_alias)
  WHERE is_active = true;

ALTER TABLE org_lucidgateway_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org lucidgateway keys in their org"
  ON org_lucidgateway_keys
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org owners/admins can insert org lucidgateway keys"
  ON org_lucidgateway_keys
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org owners/admins can update org lucidgateway keys"
  ON org_lucidgateway_keys
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_org_lucidgateway_keys_updated_at'
  ) THEN
    CREATE TRIGGER update_org_lucidgateway_keys_updated_at
      BEFORE UPDATE ON org_lucidgateway_keys
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON org_lucidgateway_keys TO service_role;
