-- Migration 059: Tenant Encryption Keys
-- Phase 1B: Encrypted Agent Foundations
-- See docs/OPENCLAW_INTEGRATION_SPEC.md §3.2

CREATE TABLE IF NOT EXISTS tenant_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  encrypted_dek TEXT NOT NULL,           -- DEK encrypted by CMK (or HKDF-derived master)
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  created_at TIMESTAMPTZ DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, key_version)
);

CREATE INDEX IF NOT EXISTS idx_tenant_encryption_keys_active
  ON tenant_encryption_keys(tenant_id, is_active)
  WHERE is_active = true;

COMMENT ON TABLE tenant_encryption_keys IS
  'Per-tenant Data Encryption Keys (DEKs) wrapped by master key. Phase 1B: HKDF-derived. Phase 4: KMS-backed. See docs/OPENCLAW_INTEGRATION_SPEC.md §3.2';