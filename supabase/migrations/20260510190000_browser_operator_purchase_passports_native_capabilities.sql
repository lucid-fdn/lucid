-- ============================================================================
-- Browser Operator purchase passports, native capability inventory, and proxy policy
--
-- Makes autonomous buying rail selection data-driven and fail-closed:
-- Lucid owns purchase identity/policy state, native rails are source-linked, and
-- browser/proxy fallback is governed instead of treated as a checkout bypass.
-- ============================================================================

CREATE TABLE IF NOT EXISTS browser_operator_purchase_passports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'revoked', 'locked')),
  scope TEXT NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('personal', 'household', 'team', 'business', 'project')),
  default_currency TEXT NOT NULL DEFAULT 'usd',
  default_country TEXT,
  consent_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  address_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_method_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  memory_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_purchase_passports_name_len CHECK (char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_purchase_passports_consent_object CHECK (jsonb_typeof(consent_policy) = 'object'),
  CONSTRAINT browser_operator_purchase_passports_budget_object CHECK (jsonb_typeof(budget_policy) = 'object'),
  CONSTRAINT browser_operator_purchase_passports_addresses_array CHECK (jsonb_typeof(address_refs) = 'array'),
  CONSTRAINT browser_operator_purchase_passports_payment_refs_array CHECK (jsonb_typeof(payment_method_refs) = 'array'),
  CONSTRAINT browser_operator_purchase_passports_memory_object CHECK (jsonb_typeof(memory_scope) = 'object'),
  CONSTRAINT browser_operator_purchase_passports_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_passports_org_owner_status
  ON browser_operator_purchase_passports(org_id, owner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_passports_org_project_status
  ON browser_operator_purchase_passports(org_id, project_id, status, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_purchase_passports_default_active
  ON browser_operator_purchase_passports(org_id, owner_user_id, scope)
  WHERE status = 'active'
    AND owner_user_id IS NOT NULL
    AND COALESCE((metadata->>'allow_multiple_active')::BOOLEAN, false) = false;

CREATE TABLE IF NOT EXISTS browser_operator_purchase_passport_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id UUID NOT NULL REFERENCES browser_operator_purchase_passports(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'approver', 'viewer', 'beneficiary')),
  spend_limit JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_purchase_passport_members_spend_object CHECK (jsonb_typeof(spend_limit) = 'object'),
  CONSTRAINT browser_operator_purchase_passport_members_approval_object CHECK (jsonb_typeof(approval_policy) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_passport_members_passport
  ON browser_operator_purchase_passport_members(passport_id, role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_passport_members_org_user
  ON browser_operator_purchase_passport_members(org_id, user_id, role);

CREATE TABLE IF NOT EXISTS browser_operator_merchant_native_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  merchant_key TEXT NOT NULL,
  merchant_domain TEXT,
  country TEXT,
  provider TEXT NOT NULL,
  capability_level TEXT NOT NULL
    CHECK (capability_level IN (
      'native_checkout',
      'native_cart_handoff',
      'native_catalog_only',
      'partner_only',
      'browser_required',
      'research_only'
    )),
  rail_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'research'
    CHECK (status IN ('research', 'requested', 'sandbox', 'staging', 'live', 'blocked', 'deprecated')),
  access_model TEXT NOT NULL
    CHECK (access_model IN ('public', 'oauth', 'partner_contract', 'invite_only', 'merchant_specific', 'third_party')),
  supported_operations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  required_credentials TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  required_env TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  countries TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  promotion_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_native_capabilities_merchant_key_len CHECK (char_length(merchant_key) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_native_capabilities_provider_len CHECK (char_length(provider) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_native_capabilities_rail_len CHECK (char_length(rail_id) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_native_capabilities_evidence_object CHECK (jsonb_typeof(promotion_evidence) = 'object'),
  CONSTRAINT browser_operator_native_capabilities_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_native_capabilities_unique
  ON browser_operator_merchant_native_capabilities(
    merchant_key,
    COALESCE(country, ''),
    provider,
    rail_id
  );

CREATE INDEX IF NOT EXISTS idx_browser_operator_native_capabilities_level_status
  ON browser_operator_merchant_native_capabilities(capability_level, status, last_verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_native_capabilities_domain_country
  ON browser_operator_merchant_native_capabilities(merchant_domain, country)
  WHERE merchant_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS browser_operator_proxy_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'revoked')),
  mode TEXT NOT NULL DEFAULT 'read_only_only'
    CHECK (mode IN ('disabled', 'read_only_only', 'authenticated_profile', 'premium_only', 'byo_only')),
  allowed_providers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_countries TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allow_residential BOOLEAN NOT NULL DEFAULT false,
  allow_datacenter BOOLEAN NOT NULL DEFAULT true,
  allow_byo_proxy BOOLEAN NOT NULL DEFAULT false,
  checkout_allowed BOOLEAN NOT NULL DEFAULT false,
  max_retries INTEGER NOT NULL DEFAULT 1 CHECK (max_retries >= 0 AND max_retries <= 5),
  session_affinity_required BOOLEAN NOT NULL DEFAULT true,
  fallback_allowed_for TEXT NOT NULL DEFAULT 'read_only'
    CHECK (fallback_allowed_for IN ('read_only', 'cart_building', 'never')),
  audit_level TEXT NOT NULL DEFAULT 'summary'
    CHECK (audit_level IN ('summary', 'full')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_proxy_policies_name_len CHECK (char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_proxy_policies_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_proxy_policies_org_status
  ON browser_operator_proxy_policies(org_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_proxy_policies_org_name_active
  ON browser_operator_proxy_policies(org_id, lower(name))
  WHERE status = 'active';

DROP TRIGGER IF EXISTS touch_browser_operator_purchase_passports_updated_at ON browser_operator_purchase_passports;
CREATE TRIGGER touch_browser_operator_purchase_passports_updated_at
  BEFORE UPDATE ON browser_operator_purchase_passports
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

DROP TRIGGER IF EXISTS touch_browser_operator_purchase_passport_members_updated_at ON browser_operator_purchase_passport_members;
CREATE TRIGGER touch_browser_operator_purchase_passport_members_updated_at
  BEFORE UPDATE ON browser_operator_purchase_passport_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

DROP TRIGGER IF EXISTS touch_browser_operator_native_capabilities_updated_at ON browser_operator_merchant_native_capabilities;
CREATE TRIGGER touch_browser_operator_native_capabilities_updated_at
  BEFORE UPDATE ON browser_operator_merchant_native_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

DROP TRIGGER IF EXISTS touch_browser_operator_proxy_policies_updated_at ON browser_operator_proxy_policies;
CREATE TRIGGER touch_browser_operator_proxy_policies_updated_at
  BEFORE UPDATE ON browser_operator_proxy_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

ALTER TABLE browser_operator_purchase_passports ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_purchase_passport_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_merchant_native_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_proxy_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS browser_operator_purchase_passports_org_select ON browser_operator_purchase_passports;
CREATE POLICY browser_operator_purchase_passports_org_select ON browser_operator_purchase_passports
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_passports_org_write ON browser_operator_purchase_passports;
CREATE POLICY browser_operator_purchase_passports_org_write ON browser_operator_purchase_passports
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_passports_org_update ON browser_operator_purchase_passports;
CREATE POLICY browser_operator_purchase_passports_org_update ON browser_operator_purchase_passports
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_passports_service_all ON browser_operator_purchase_passports;
CREATE POLICY browser_operator_purchase_passports_service_all ON browser_operator_purchase_passports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_purchase_passport_members_org_select ON browser_operator_purchase_passport_members;
CREATE POLICY browser_operator_purchase_passport_members_org_select ON browser_operator_purchase_passport_members
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_passport_members_service_all ON browser_operator_purchase_passport_members;
CREATE POLICY browser_operator_purchase_passport_members_service_all ON browser_operator_purchase_passport_members
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_native_capabilities_public_select ON browser_operator_merchant_native_capabilities;
CREATE POLICY browser_operator_native_capabilities_public_select ON browser_operator_merchant_native_capabilities
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS browser_operator_native_capabilities_service_all ON browser_operator_merchant_native_capabilities;
CREATE POLICY browser_operator_native_capabilities_service_all ON browser_operator_merchant_native_capabilities
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_proxy_policies_org_select ON browser_operator_proxy_policies;
CREATE POLICY browser_operator_proxy_policies_org_select ON browser_operator_proxy_policies
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_proxy_policies_service_all ON browser_operator_proxy_policies;
CREATE POLICY browser_operator_proxy_policies_service_all ON browser_operator_proxy_policies
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
