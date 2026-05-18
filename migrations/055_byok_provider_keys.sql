-- ============================================================================
-- Migration 055: BYOK Provider Keys + Gateway Key Inference Mode
--
-- Purpose:
-- - Store user-provided provider API keys (BYOK) encrypted at rest
-- - Add inference_mode to gateway keys (byok vs managed)
-- - Enable Option B: BYOK on all tiers, Managed on Pro+
-- ============================================================================

-- 1. Provider keys table
CREATE TABLE IF NOT EXISTS org_provider_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  provider TEXT NOT NULL CHECK (provider IN (
    'openai', 'anthropic', 'groq', 'cohere',
    'google', 'mistral', 'perplexity', 'deepseek',
    'together', 'fireworks', 'openrouter'
  )),
  key_name TEXT,                           -- e.g. "Production OpenAI Key"
  encrypted_key TEXT NOT NULL,             -- AES-256-GCM encrypted
  key_preview TEXT NOT NULL DEFAULT '',    -- e.g. "sk-...abc1" (last 4 chars)

  is_active BOOLEAN NOT NULL DEFAULT true,
  last_verified_at TIMESTAMPTZ,            -- last successful API call
  last_used_at TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'valid', 'invalid', 'expired')),

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active key per provider per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_provider_key_active
  ON org_provider_keys(org_id, provider)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_org_provider_keys_org
  ON org_provider_keys(org_id, is_active);

CREATE INDEX IF NOT EXISTS idx_org_provider_keys_provider
  ON org_provider_keys(org_id, provider);

-- RLS
ALTER TABLE org_provider_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org provider keys in their org"
  ON org_provider_keys
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org owners/admins can insert org provider keys"
  ON org_provider_keys
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org owners/admins can update org provider keys"
  ON org_provider_keys
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

CREATE POLICY "Org owners/admins can delete org provider keys"
  ON org_provider_keys
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_org_provider_keys_updated_at'
  ) THEN
    CREATE TRIGGER update_org_provider_keys_updated_at
      BEFORE UPDATE ON org_provider_keys
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON org_provider_keys TO service_role;

-- 2. Add inference_mode to existing gateway keys table
ALTER TABLE org_lucidgateway_keys
  ADD COLUMN IF NOT EXISTS inference_mode TEXT NOT NULL DEFAULT 'managed'
    CHECK (inference_mode IN ('byok', 'managed'));

-- Index for filtering by inference mode
CREATE INDEX IF NOT EXISTS idx_org_lucidgateway_keys_inference_mode
  ON org_lucidgateway_keys(org_id, inference_mode)
  WHERE is_active = true;

-- 3. Audit log for provider key operations
CREATE TABLE IF NOT EXISTS org_provider_key_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key_id UUID REFERENCES org_provider_keys(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'deleted', 'activated', 'deactivated',
    'verified', 'verification_failed', 'rotated'
  )),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_provider_key_audit_org
  ON org_provider_key_audit(org_id, created_at DESC);

ALTER TABLE org_provider_key_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view provider key audit in their org"
  ON org_provider_key_audit
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert provider key audit"
  ON org_provider_key_audit
  FOR INSERT
  WITH CHECK (true);

GRANT SELECT, INSERT ON org_provider_key_audit TO service_role;