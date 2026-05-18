-- ============================================================================
-- Browser Operator provider-auth refs
--
-- Nango authenticates provider APIs/accounts. Browser Operator still owns
-- browser execution, profile affinity, purchase policy, and evidence state.
-- These columns make the Nango/local connection ref explicit instead of
-- hiding it in metadata.
-- ============================================================================

ALTER TABLE browser_operator_accounts
  ADD COLUMN IF NOT EXISTS org_connection_id UUID REFERENCES org_integration_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT,
  ADD COLUMN IF NOT EXISTS auth_connection_id TEXT;

ALTER TABLE browser_operator_byo_runtimes
  ADD COLUMN IF NOT EXISTS org_connection_id UUID REFERENCES org_integration_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT,
  ADD COLUMN IF NOT EXISTS auth_connection_id TEXT;

CREATE INDEX IF NOT EXISTS idx_browser_operator_accounts_org_connection
  ON browser_operator_accounts(org_connection_id)
  WHERE org_connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_browser_operator_accounts_auth_connection
  ON browser_operator_accounts(org_id, auth_provider, auth_connection_id)
  WHERE auth_provider IS NOT NULL AND auth_connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_browser_operator_byo_runtimes_org_connection
  ON browser_operator_byo_runtimes(org_connection_id)
  WHERE org_connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_browser_operator_byo_runtimes_auth_connection
  ON browser_operator_byo_runtimes(org_id, auth_provider, auth_connection_id)
  WHERE auth_provider IS NOT NULL AND auth_connection_id IS NOT NULL;

COMMENT ON COLUMN browser_operator_accounts.org_connection_id IS 'Optional local org_integration_connections row for Nango-managed provider auth.';
COMMENT ON COLUMN browser_operator_accounts.auth_provider IS 'Nango provider config key for provider auth, e.g. browserbase, steel, custom merchant API.';
COMMENT ON COLUMN browser_operator_accounts.auth_connection_id IS 'Nango connectionId for provider auth. Browser execution still routes through Browser Operator.';
COMMENT ON COLUMN browser_operator_byo_runtimes.org_connection_id IS 'Optional local org_integration_connections row for Nango-managed BYO runtime auth.';
COMMENT ON COLUMN browser_operator_byo_runtimes.auth_provider IS 'Nango provider config key for BYO runtime auth.';
COMMENT ON COLUMN browser_operator_byo_runtimes.auth_connection_id IS 'Nango connectionId for BYO runtime auth/token lookup.';
