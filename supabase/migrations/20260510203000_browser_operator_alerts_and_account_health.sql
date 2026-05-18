-- ============================================================================
-- Browser Operator alerts and authenticated-account health
--
-- Gives Mission Control a durable, org-scoped operator inbox for merchant
-- account problems, secure takeover needs, provider degradation, and receipt
-- gaps without leaking provider secrets or raw credentials to clients.
-- ============================================================================

CREATE TABLE IF NOT EXISTS browser_operator_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  browser_account_id UUID REFERENCES browser_operator_accounts(id) ON DELETE SET NULL,
  purchase_run_id UUID REFERENCES browser_operator_purchase_runs(id) ON DELETE SET NULL,
  ops_run_id UUID,
  alert_type TEXT NOT NULL
    CHECK (alert_type IN (
      'account_needs_connect',
      'account_expired',
      'account_mfa_required',
      'account_captcha_required',
      'account_failed',
      'profile_degraded',
      'connect_session_expiring',
      'handoff_required',
      'purchase_blocked',
      'receipt_missing',
      'provider_unhealthy',
      'policy_attention'
    )),
  severity TEXT NOT NULL DEFAULT 'needs_attention'
    CHECK (severity IN ('info', 'needs_attention', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  primary_cta JSONB NOT NULL DEFAULT '{}'::jsonb,
  href TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_alerts_dedupe_len CHECK (char_length(dedupe_key) BETWEEN 1 AND 255),
  CONSTRAINT browser_operator_alerts_title_len CHECK (char_length(title) BETWEEN 1 AND 180),
  CONSTRAINT browser_operator_alerts_cta_object CHECK (jsonb_typeof(primary_cta) = 'object'),
  CONSTRAINT browser_operator_alerts_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_alerts_org_status
  ON browser_operator_alerts(org_id, status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_alerts_account_status
  ON browser_operator_alerts(browser_account_id, status, created_at DESC)
  WHERE browser_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_browser_operator_alerts_purchase_run
  ON browser_operator_alerts(purchase_run_id, status, created_at DESC)
  WHERE purchase_run_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_alerts_open_dedupe
  ON browser_operator_alerts(org_id, dedupe_key)
  WHERE status IN ('open', 'acknowledged');

CREATE TABLE IF NOT EXISTS browser_operator_account_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  browser_account_id UUID NOT NULL REFERENCES browser_operator_accounts(id) ON DELETE CASCADE,
  health_state TEXT NOT NULL
    CHECK (health_state IN ('ready', 'needs_login', 'needs_attention', 'expired', 'blocked', 'revoked', 'unknown')),
  score INTEGER NOT NULL DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  profile_status TEXT
    CHECK (profile_status IS NULL OR profile_status IN ('active', 'degraded', 'expired', 'migration_required', 'revoked')),
  last_successful_run_at TIMESTAMPTZ,
  last_failed_run_at TIMESTAMPTZ,
  last_handoff_at TIMESTAMPTZ,
  last_receipt_at TIMESTAMPTZ,
  captcha_rate NUMERIC(5, 4) CHECK (captcha_rate IS NULL OR (captcha_rate >= 0 AND captcha_rate <= 1)),
  handoff_rate NUMERIC(5, 4) CHECK (handoff_rate IS NULL OR (handoff_rate >= 0 AND handoff_rate <= 1)),
  checkout_success_rate NUMERIC(5, 4) CHECK (checkout_success_rate IS NULL OR (checkout_success_rate >= 0 AND checkout_success_rate <= 1)),
  receipt_success_rate NUMERIC(5, 4) CHECK (receipt_success_rate IS NULL OR (receipt_success_rate >= 0 AND receipt_success_rate <= 1)),
  average_run_ms INTEGER CHECK (average_run_ms IS NULL OR average_run_ms >= 0),
  recommended_action TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_account_health_recommended_len CHECK (recommended_action IS NULL OR char_length(recommended_action) <= 500),
  CONSTRAINT browser_operator_account_health_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_account_health_org_created
  ON browser_operator_account_health_snapshots(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_account_health_account_created
  ON browser_operator_account_health_snapshots(browser_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_account_health_state
  ON browser_operator_account_health_snapshots(org_id, health_state, created_at DESC);

DROP TRIGGER IF EXISTS touch_browser_operator_alerts_updated_at ON browser_operator_alerts;
CREATE TRIGGER touch_browser_operator_alerts_updated_at
  BEFORE UPDATE ON browser_operator_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

ALTER TABLE browser_operator_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_account_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS browser_operator_alerts_org_select ON browser_operator_alerts;
CREATE POLICY browser_operator_alerts_org_select ON browser_operator_alerts
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_alerts_org_update ON browser_operator_alerts;
CREATE POLICY browser_operator_alerts_org_update ON browser_operator_alerts
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

DROP POLICY IF EXISTS browser_operator_alerts_service_all ON browser_operator_alerts;
CREATE POLICY browser_operator_alerts_service_all ON browser_operator_alerts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_account_health_org_select ON browser_operator_account_health_snapshots;
CREATE POLICY browser_operator_account_health_org_select ON browser_operator_account_health_snapshots
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_account_health_service_all ON browser_operator_account_health_snapshots;
CREATE POLICY browser_operator_account_health_service_all ON browser_operator_account_health_snapshots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
