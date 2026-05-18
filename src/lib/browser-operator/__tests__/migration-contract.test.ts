import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260510120000_browser_operator_accounts_and_purchase_policies.sql',
)
const connectionMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260510153000_browser_operator_connect_sessions_and_receipts.sql',
)
const capacityMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260510170000_browser_operator_profiles_and_byo_runtimes.sql',
)
const nangoAuthMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260510173000_browser_operator_nango_auth_refs.sql',
)
const providerIntegrationMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260510174500_seed_browser_operator_provider_integrations.sql',
)
const purchasePassportNativeCapabilityMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260510190000_browser_operator_purchase_passports_native_capabilities.sql',
)
const alertsHealthMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260510203000_browser_operator_alerts_and_account_health.sql',
)

describe('Browser Operator migration contract', () => {
  it('creates the managed-agent control-plane tables', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_accounts')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_credential_refs')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_purchase_policies')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_purchase_runs')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_purchase_cart_items')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_audit_events')
  })

  it('keeps credential refs service-only and raw credentials explicitly gated', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('browser_operator_credential_refs_raw_guard')
    expect(sql).toContain("credential_kind NOT IN ('password', 'totp_seed', 'recovery_code')")
    expect(sql).toContain("requires_feature_flag IS NOT NULL")
    expect(sql).toContain("consent_grant_id IS NOT NULL")
    expect(sql).toContain('browser_operator_credential_refs_service_all')
    expect(sql).not.toContain('browser_operator_credential_refs_org_select')
  })

  it('limits account and policy writes to organization owners/admins at RLS', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("role IN ('owner', 'admin')")
    expect(sql).toContain('browser_operator_accounts_org_write')
    expect(sql).toContain('browser_operator_accounts_org_update')
    expect(sql).toContain('browser_operator_purchase_policies_org_write')
    expect(sql).toContain('browser_operator_purchase_policies_org_update')
  })

  it('adds secure takeover sessions and receipt tables as service-owned runtime state', () => {
    const sql = fs.readFileSync(connectionMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_connect_sessions')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_purchase_receipts')
    expect(sql).toContain('browser_operator_connect_sessions_service_all')
    expect(sql).toContain('browser_operator_purchase_receipts_service_all')
    expect(sql).toContain('idx_browser_operator_purchase_receipts_run_unique')
  })

  it('adds profile affinity and BYO runtime capacity tables', () => {
    const sql = fs.readFileSync(capacityMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_profiles')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_byo_runtimes')
    expect(sql).toContain('idx_browser_operator_profiles_active_account_provider')
    expect(sql).toContain('idx_browser_operator_byo_runtimes_org_status')
    expect(sql).toContain('browser_operator_profiles_service_all')
    expect(sql).toContain('browser_operator_byo_runtimes_service_all')
  })

  it('adds explicit Nango provider-auth refs for accounts and BYO runtimes', () => {
    const sql = fs.readFileSync(nangoAuthMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE browser_operator_accounts')
    expect(sql).toContain('ALTER TABLE browser_operator_byo_runtimes')
    expect(sql).toContain('org_connection_id UUID REFERENCES org_integration_connections')
    expect(sql).toContain('auth_provider TEXT')
    expect(sql).toContain('auth_connection_id TEXT')
    expect(sql).toContain('idx_browser_operator_accounts_auth_connection')
    expect(sql).toContain('idx_browser_operator_byo_runtimes_auth_connection')
  })

  it('lists Browser Operator provider auth in the shared Nango integration catalog', () => {
    const sql = fs.readFileSync(providerIntegrationMigrationPath, 'utf8')

    expect(sql).toContain('INSERT INTO plugin_catalog')
    expect(sql).toContain("'browserbase'")
    expect(sql).toContain("'steel'")
    expect(sql).toContain("'browserless'")
    expect(sql).toContain("'custom-browser-runtime'")
    expect(sql).toContain("'browser-operator'")
    expect(sql).toContain("'integration'")
    expect(sql).toContain("'nango'")
    expect(sql).toContain("'api-key'")
  })

  it('adds Purchase Passport, native capability, and proxy policy control-plane tables', () => {
    const sql = fs.readFileSync(purchasePassportNativeCapabilityMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_purchase_passports')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_purchase_passport_members')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_merchant_native_capabilities')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_proxy_policies')
    expect(sql).toContain("capability_level IN (")
    expect(sql).toContain("'native_checkout'")
    expect(sql).toContain("'native_cart_handoff'")
    expect(sql).toContain("'partner_only'")
    expect(sql).toContain("fallback_allowed_for IN ('read_only', 'cart_building', 'never')")
    expect(sql).toContain('browser_operator_native_capabilities_public_select')
    expect(sql).toContain('browser_operator_proxy_policies_service_all')
  })

  it('adds Browser Operator alerts and account-health snapshots for assisted handoff UX', () => {
    const sql = fs.readFileSync(alertsHealthMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_alerts')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS browser_operator_account_health_snapshots')
    expect(sql).toContain('idx_browser_operator_alerts_open_dedupe')
    expect(sql).toContain('idx_browser_operator_account_health_account_created')
    expect(sql).toContain("'handoff_required'")
    expect(sql).toContain("'receipt_missing'")
    expect(sql).toContain("health_state IN ('ready', 'needs_login', 'needs_attention', 'expired', 'blocked', 'revoked', 'unknown')")
    expect(sql).toContain('browser_operator_alerts_org_select')
    expect(sql).toContain('browser_operator_alerts_service_all')
    expect(sql).toContain('browser_operator_account_health_service_all')
  })
})
