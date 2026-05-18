-- ============================================================================
-- Browser Operator secure takeover sessions and purchase receipts
--
-- Adds the durable state needed for one-time merchant account connection,
-- provider profile/session reuse, and post-checkout receipt capture.
-- ============================================================================

CREATE TABLE IF NOT EXISTS browser_operator_connect_sessions (
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
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested',
      'provider_ready',
      'active',
      'connected',
      'expired',
      'failed',
      'cancelled'
    )),
  takeover_url TEXT,
  live_view_url TEXT,
  provider_session_ref TEXT,
  provider_profile_ref TEXT,
  provider_context_ref TEXT,
  return_url TEXT,
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_connect_sessions_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_connect_sessions_account_created
  ON browser_operator_connect_sessions(browser_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_connect_sessions_org_status
  ON browser_operator_connect_sessions(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_browser_operator_connect_sessions_expires
  ON browser_operator_connect_sessions(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS browser_operator_purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-10',
  schema_version INTEGER NOT NULL DEFAULT 1,

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  browser_account_id UUID REFERENCES browser_operator_accounts(id) ON DELETE SET NULL,
  purchase_run_id UUID NOT NULL REFERENCES browser_operator_purchase_runs(id) ON DELETE CASCADE,
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
  merchant_order_id TEXT,
  receipt_url TEXT,
  receipt_artifact_uri TEXT,
  total_amount INTEGER CHECK (total_amount IS NULL OR total_amount >= 0),
  total_currency TEXT,
  purchased_at TIMESTAMPTZ,
  raw_receipt JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT browser_operator_purchase_receipts_raw_object CHECK (jsonb_typeof(raw_receipt) = 'object'),
  CONSTRAINT browser_operator_purchase_receipts_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT browser_operator_purchase_receipts_total_currency_present CHECK (
    (total_amount IS NULL AND total_currency IS NULL)
    OR (total_amount IS NOT NULL AND total_currency IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_purchase_receipts_run_unique
  ON browser_operator_purchase_receipts(purchase_run_id);

CREATE INDEX IF NOT EXISTS idx_browser_operator_purchase_receipts_org_created
  ON browser_operator_purchase_receipts(org_id, created_at DESC);

DROP TRIGGER IF EXISTS touch_browser_operator_connect_sessions_updated_at ON browser_operator_connect_sessions;
CREATE TRIGGER touch_browser_operator_connect_sessions_updated_at
  BEFORE UPDATE ON browser_operator_connect_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_browser_operator_updated_at();

ALTER TABLE browser_operator_connect_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_operator_purchase_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS browser_operator_connect_sessions_org_select ON browser_operator_connect_sessions;
CREATE POLICY browser_operator_connect_sessions_org_select ON browser_operator_connect_sessions
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_connect_sessions_service_all ON browser_operator_connect_sessions;
CREATE POLICY browser_operator_connect_sessions_service_all ON browser_operator_connect_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS browser_operator_purchase_receipts_org_select ON browser_operator_purchase_receipts;
CREATE POLICY browser_operator_purchase_receipts_org_select ON browser_operator_purchase_receipts
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS browser_operator_purchase_receipts_service_all ON browser_operator_purchase_receipts;
CREATE POLICY browser_operator_purchase_receipts_service_all ON browser_operator_purchase_receipts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
