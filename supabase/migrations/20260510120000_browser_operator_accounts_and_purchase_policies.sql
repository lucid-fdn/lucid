-- ============================================================================
-- Browser Operator account/session control plane
--
-- Lucid owns canonical account, policy, purchase, audit, and receipt state.
-- Browser providers are execution backends only; provider refs are adapter
-- handles, never product source of truth.
-- ============================================================================

CREATE TABLE IF NOT EXISTS browser_operator_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  merchant_key TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
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
  provider_account_ref TEXT,
  provider_profile_ref TEXT,
  provider_context_ref TEXT,
  auth_state TEXT NOT NULL DEFAULT 'needs_connect'
    CHECK (auth_state IN (
      'needs_connect',
      'connected',
      'expired',
      'mfa_required',
      'captcha_required',
      'revoked',
      'disabled',
      'failed'
    )),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  session_secret_ref TEXT,
  default_credential_ref_id UUID,
  last_verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_accounts_merchant_key_len CHECK (char_length(merchant_key) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_accounts_merchant_name_len CHECK (char_length(merchant_name) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_accounts_capabilities_array CHECK (jsonb_typeof(capabilities) = 'array'),
  CONSTRAINT browser_operator_accounts_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_accounts_org_user_state
  ON browser_operator_accounts(org_id, user_id, auth_state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_accounts_org_merchant_provider
  ON browser_operator_accounts(org_id, merchant_key, provider);

CREATE INDEX IF NOT EXISTS idx_browser_operator_accounts_expires
  ON browser_operator_accounts(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_accounts_active_unique
  ON browser_operator_accounts(org_id, user_id, merchant_key, provider)
  WHERE auth_state NOT IN ('revoked', 'disabled', 'failed');

CREATE TABLE IF NOT EXISTS browser_operator_credential_refs (
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
  storage_owner TEXT NOT NULL
    CHECK (storage_owner IN ('merchant_session', 'provider_vault', 'lucid_vault')),
  secret_ref TEXT NOT NULL,
  credential_kind TEXT NOT NULL
    CHECK (credential_kind IN (
      'provider_profile',
      'browser_context',
      'merchant_session',
      'provider_credential',
      'oauth_refresh_token',
      'api_token',
      'session_refresh',
      'password',
      'totp_seed',
      'recovery_code'
    )),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'rotating', 'revoked', 'expired', 'failed')),
  requires_feature_flag TEXT,
  consent_grant_id TEXT,
  last_access_audit_id TEXT,
  last_accessed_by_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  last_rotated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_credential_refs_secret_len CHECK (char_length(secret_ref) BETWEEN 1 AND 255),
  CONSTRAINT browser_operator_credential_refs_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT browser_operator_credential_refs_raw_guard CHECK (
    credential_kind NOT IN ('password', 'totp_seed', 'recovery_code')
    OR (
      storage_owner = 'lucid_vault'
      AND requires_feature_flag IS NOT NULL
      AND consent_grant_id IS NOT NULL
    )
  )
);

ALTER TABLE browser_operator_accounts
  DROP CONSTRAINT IF EXISTS browser_operator_accounts_default_credential_ref_fk;

ALTER TABLE browser_operator_accounts
  ADD CONSTRAINT browser_operator_accounts_default_credential_ref_fk
  FOREIGN KEY (default_credential_ref_id)
  REFERENCES browser_operator_credential_refs(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_browser_operator_credential_refs_account
  ON browser_operator_credential_refs(browser_account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_credential_refs_org_status
  ON browser_operator_credential_refs(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_credential_refs_run_access
  ON browser_operator_credential_refs(last_accessed_by_run_id)
  WHERE last_accessed_by_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS browser_operator_purchase_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  browser_account_id UUID REFERENCES browser_operator_accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'revoked', 'expired')),
  schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_total_amount INTEGER CHECK (max_total_amount IS NULL OR max_total_amount > 0),
  max_total_currency TEXT,
  allowed_merchant_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blocked_merchant_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blocked_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  max_item_count INTEGER CHECK (max_item_count IS NULL OR max_item_count > 0),
  allow_substitutions BOOLEAN NOT NULL DEFAULT false,
  max_substitution_delta_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (max_substitution_delta_percent >= 0 AND max_substitution_delta_percent <= 100),
  requires_human_approval BOOLEAN NOT NULL DEFAULT true,
  auto_approve_inside_policy BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_purchase_policies_name_len CHECK (char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT browser_operator_purchase_policies_schedule_object CHECK (jsonb_typeof(schedule) = 'object'),
  CONSTRAINT browser_operator_purchase_policies_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT browser_operator_purchase_policies_currency_present CHECK (
    (max_total_amount IS NULL AND max_total_currency IS NULL)
    OR (max_total_amount IS NOT NULL AND max_total_currency IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_policies_org_status
  ON browser_operator_purchase_policies(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_policies_account
  ON browser_operator_purchase_policies(browser_account_id, status, created_at DESC)
  WHERE browser_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS browser_operator_purchase_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  browser_account_id UUID REFERENCES browser_operator_accounts(id) ON DELETE SET NULL,
  purchase_policy_id UUID REFERENCES browser_operator_purchase_policies(id) ON DELETE SET NULL,
  agent_commerce_spend_request_id UUID REFERENCES agent_spend_requests(id) ON DELETE SET NULL,

  idempotency_key TEXT NOT NULL,
  merchant JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'building_cart',
      'policy_checking',
      'requires_approval',
      'approved',
      'checkout_attempted',
      'completed',
      'blocked',
      'failed',
      'cancelled'
    )),
  cart_hash TEXT,
  cart_total_amount INTEGER CHECK (cart_total_amount IS NULL OR cart_total_amount >= 0),
  cart_total_currency TEXT,
  policy_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_state TEXT NOT NULL DEFAULT 'required'
    CHECK (approval_state IN ('not_required', 'required', 'approved', 'blocked', 'expired')),
  receipt_ref TEXT,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_purchase_runs_idempotency_len CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  CONSTRAINT browser_operator_purchase_runs_merchant_object CHECK (jsonb_typeof(merchant) = 'object'),
  CONSTRAINT browser_operator_purchase_runs_policy_object CHECK (jsonb_typeof(policy_decision) = 'object'),
  CONSTRAINT browser_operator_purchase_runs_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT browser_operator_purchase_runs_total_currency_present CHECK (
    (cart_total_amount IS NULL AND cart_total_currency IS NULL)
    OR (cart_total_amount IS NOT NULL AND cart_total_currency IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_purchase_runs_org_idempotency
  ON browser_operator_purchase_runs(org_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_runs_org_status
  ON browser_operator_purchase_runs(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_runs_ops_run
  ON browser_operator_purchase_runs(ops_run_id, created_at DESC)
  WHERE ops_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS browser_operator_purchase_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_run_id UUID NOT NULL REFERENCES browser_operator_purchase_runs(id) ON DELETE CASCADE,
  merchant_item_id TEXT,
  name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit TEXT,
  unit_price NUMERIC(12,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  total_price NUMERIC(12,2) CHECK (total_price IS NULL OR total_price >= 0),
  currency TEXT NOT NULL,
  category TEXT,
  substitution_for TEXT,
  policy_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_purchase_cart_items_name_len CHECK (char_length(name) BETWEEN 1 AND 240),
  CONSTRAINT browser_operator_purchase_cart_items_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_cart_items_run
  ON browser_operator_purchase_cart_items(purchase_run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS browser_operator_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  browser_account_id UUID REFERENCES browser_operator_accounts(id) ON DELETE SET NULL,
  credential_ref_id UUID REFERENCES browser_operator_credential_refs(id) ON DELETE SET NULL,
  purchase_run_id UUID REFERENCES browser_operator_purchase_runs(id) ON DELETE SET NULL,
  ops_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('user', 'agent', 'runtime', 'provider', 'system')),
  actor_id TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warn', 'error', 'block')),
  reason TEXT,
  result TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_audit_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_audit_events_org_created
  ON browser_operator_audit_events(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_audit_events_account
  ON browser_operator_audit_events(browser_account_id, created_at DESC)
  WHERE browser_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_browser_operator_audit_events_credential
  ON browser_operator_audit_events(credential_ref_id, created_at DESC)
  WHERE credential_ref_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_browser_operator_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_browser_operator_accounts_updated_at ON browser_operator_accounts;
CREATE TRIGGER touch_browser_operator_accounts_updated_at
  BEFORE UPDATE ON browser_operator_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

DROP TRIGGER IF EXISTS touch_browser_operator_credential_refs_updated_at ON browser_operator_credential_refs;
CREATE TRIGGER touch_browser_operator_credential_refs_updated_at
  BEFORE UPDATE ON browser_operator_credential_refs
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

DROP TRIGGER IF EXISTS touch_browser_operator_purchase_policies_updated_at ON browser_operator_purchase_policies;
CREATE TRIGGER touch_browser_operator_purchase_policies_updated_at
  BEFORE UPDATE ON browser_operator_purchase_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

DROP TRIGGER IF EXISTS touch_browser_operator_purchase_runs_updated_at ON browser_operator_purchase_runs;
CREATE TRIGGER touch_browser_operator_purchase_runs_updated_at
  BEFORE UPDATE ON browser_operator_purchase_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

ALTER TABLE browser_operator_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_credential_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_purchase_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_purchase_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_purchase_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS browser_operator_accounts_org_select ON browser_operator_accounts;
CREATE POLICY browser_operator_accounts_org_select ON browser_operator_accounts
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_accounts_org_write ON browser_operator_accounts;
CREATE POLICY browser_operator_accounts_org_write ON browser_operator_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS browser_operator_accounts_org_update ON browser_operator_accounts;
CREATE POLICY browser_operator_accounts_org_update ON browser_operator_accounts
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

DROP POLICY IF EXISTS browser_operator_accounts_service_all ON browser_operator_accounts;
CREATE POLICY browser_operator_accounts_service_all ON browser_operator_accounts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Credential refs contain secret handles. Do not expose them directly to
-- authenticated PostgREST clients; APIs must return sanitized runtime refs.
DROP POLICY IF EXISTS browser_operator_credential_refs_service_all ON browser_operator_credential_refs;
CREATE POLICY browser_operator_credential_refs_service_all ON browser_operator_credential_refs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_purchase_policies_org_select ON browser_operator_purchase_policies;
CREATE POLICY browser_operator_purchase_policies_org_select ON browser_operator_purchase_policies
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_policies_org_write ON browser_operator_purchase_policies;
CREATE POLICY browser_operator_purchase_policies_org_write ON browser_operator_purchase_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_policies_org_update ON browser_operator_purchase_policies;
CREATE POLICY browser_operator_purchase_policies_org_update ON browser_operator_purchase_policies
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

DROP POLICY IF EXISTS browser_operator_purchase_policies_service_all ON browser_operator_purchase_policies;
CREATE POLICY browser_operator_purchase_policies_service_all ON browser_operator_purchase_policies
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_purchase_runs_org_select ON browser_operator_purchase_runs;
CREATE POLICY browser_operator_purchase_runs_org_select ON browser_operator_purchase_runs
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_runs_service_all ON browser_operator_purchase_runs;
CREATE POLICY browser_operator_purchase_runs_service_all ON browser_operator_purchase_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_purchase_cart_items_org_select ON browser_operator_purchase_cart_items;
CREATE POLICY browser_operator_purchase_cart_items_org_select ON browser_operator_purchase_cart_items
  FOR SELECT TO authenticated
  USING (
    purchase_run_id IN (
      SELECT id FROM browser_operator_purchase_runs
      WHERE org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_cart_items_service_all ON browser_operator_purchase_cart_items;
CREATE POLICY browser_operator_purchase_cart_items_service_all ON browser_operator_purchase_cart_items
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_audit_events_org_select ON browser_operator_audit_events;
CREATE POLICY browser_operator_audit_events_org_select ON browser_operator_audit_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_audit_events_service_all ON browser_operator_audit_events;
CREATE POLICY browser_operator_audit_events_service_all ON browser_operator_audit_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
