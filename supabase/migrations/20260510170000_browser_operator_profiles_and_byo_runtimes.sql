-- ============================================================================
-- Browser Operator profiles and BYO runtime capacity
--
-- Adds Lucid-owned browser profile records and customer-managed browser runtime
-- records. Provider refs remain adapter handles; Lucid owns policy, account,
-- evidence, and profile lifecycle state.
-- ============================================================================

CREATE TABLE IF NOT EXISTS browser_operator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  browser_account_id UUID NOT NULL REFERENCES browser_operator_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'playwright',
    'browserless',
    'browserbase',
    'stagehand',
    'steel',
    'browser_use',
    'remote_cdp',
    'lucid_managed'
  )),
  profile_artifact_ref TEXT,
  provider_profile_ref TEXT,
  provider_context_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'degraded', 'expired', 'migration_required', 'revoked')),
  last_verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  migration_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (migration_status IN ('not_required', 'pending', 'in_progress', 'completed', 'failed')),
  degraded_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_profiles_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_profiles_account_status
  ON browser_operator_profiles(browser_account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_profiles_org_provider_status
  ON browser_operator_profiles(org_id, provider, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_profiles_active_account_provider
  ON browser_operator_profiles(browser_account_id, provider)
  WHERE status IN ('active', 'degraded', 'migration_required');

CREATE TABLE IF NOT EXISTS browser_operator_byo_runtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'remote_cdp' CHECK (provider = 'remote_cdp'),
  cdp_endpoint_ref TEXT NOT NULL,
  token_ref TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'healthy', 'degraded', 'disabled', 'failed')),
  allowlisted_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  privacy_mode TEXT NOT NULL DEFAULT 'customer_managed'
    CHECK (privacy_mode IN ('standard', 'isolated', 'customer_managed')),
  cost_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_byo_runtimes_name_len CHECK (char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_byo_runtimes_endpoint_len CHECK (char_length(cdp_endpoint_ref) BETWEEN 1 AND 255),
  CONSTRAINT browser_operator_byo_runtimes_cost_policy_object CHECK (jsonb_typeof(cost_policy) = 'object'),
  CONSTRAINT browser_operator_byo_runtimes_health_object CHECK (jsonb_typeof(health) = 'object'),
  CONSTRAINT browser_operator_byo_runtimes_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_byo_runtimes_org_status
  ON browser_operator_byo_runtimes(org_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_byo_runtimes_org_name_active
  ON browser_operator_byo_runtimes(org_id, lower(name))
  WHERE status <> 'disabled';

DROP TRIGGER IF EXISTS touch_browser_operator_profiles_updated_at ON browser_operator_profiles;
CREATE TRIGGER touch_browser_operator_profiles_updated_at
  BEFORE UPDATE ON browser_operator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

DROP TRIGGER IF EXISTS touch_browser_operator_byo_runtimes_updated_at ON browser_operator_byo_runtimes;
CREATE TRIGGER touch_browser_operator_byo_runtimes_updated_at
  BEFORE UPDATE ON browser_operator_byo_runtimes
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

ALTER TABLE browser_operator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_byo_runtimes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS browser_operator_profiles_org_select ON browser_operator_profiles;
CREATE POLICY browser_operator_profiles_org_select ON browser_operator_profiles
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_profiles_service_all ON browser_operator_profiles;
CREATE POLICY browser_operator_profiles_service_all ON browser_operator_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_byo_runtimes_org_select ON browser_operator_byo_runtimes;
CREATE POLICY browser_operator_byo_runtimes_org_select ON browser_operator_byo_runtimes
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_byo_runtimes_service_all ON browser_operator_byo_runtimes;
CREATE POLICY browser_operator_byo_runtimes_service_all ON browser_operator_byo_runtimes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
