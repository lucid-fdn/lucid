import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.join(process.cwd(), 'migrations/107_agent_commerce_foundation.sql'),
  'utf8',
)
const operationsMigration = readFileSync(
  path.join(process.cwd(), 'migrations/108_agent_commerce_operations.sql'),
  'utf8',
)
const budgetMigration = readFileSync(
  path.join(process.cwd(), 'migrations/109_agent_commerce_budget_and_seller_execution.sql'),
  'utf8',
)
const entitlementMigration = readFileSync(
  path.join(process.cwd(), 'migrations/110_agent_commerce_seller_entitlements_and_limits.sql'),
  'utf8',
)
const dashboardCountsMigration = readFileSync(
  path.join(process.cwd(), 'migrations/111_agent_commerce_dashboard_event_counts.sql'),
  'utf8',
)
const dashboardLedgerMigration = readFileSync(
  path.join(process.cwd(), 'migrations/112_agent_commerce_dashboard_ledger_aggregates.sql'),
  'utf8',
)
const providerMismatchCountMigration = readFileSync(
  path.join(process.cwd(), 'migrations/113_agent_commerce_provider_mismatch_count.sql'),
  'utf8',
)
const connectionUpsertMigration = readFileSync(
  path.join(process.cwd(), 'migrations/114_agent_commerce_connection_upsert.sql'),
  'utf8',
)
const agentCommerceMigrations = [
  migration,
  operationsMigration,
  budgetMigration,
  entitlementMigration,
  dashboardCountsMigration,
  dashboardLedgerMigration,
  providerMismatchCountMigration,
  connectionUpsertMigration,
]
const allAgentCommerceSql = agentCommerceMigrations.join('\n\n')

const foundationOrgScopedTables = [
  'agent_commerce_connections',
  'agent_commerce_policies',
  'agent_spend_requests',
  'agent_commerce_credentials',
  'seller_payment_grants',
  'machine_payment_challenges',
  'machine_payment_proof_claims',
  'agent_commerce_events',
  'agent_commerce_idempotency_keys',
]

describe('Agent Commerce migration contract', () => {
  it('has an idempotent migration-apply preflight for Agent Commerce DDL', () => {
    for (const sql of agentCommerceMigrations) {
      const dollarQuoteCount = sql.match(/\$\$/g)?.length ?? 0
      expect(dollarQuoteCount % 2).toBe(0)

      const nonIdempotentTables = [...sql.matchAll(/CREATE TABLE\s+(?!IF NOT EXISTS)([a-z_]+)/gi)]
        .map((match) => match[1])
      expect(nonIdempotentTables).toEqual([])

      const nonIdempotentIndexes = [...sql.matchAll(/CREATE(?: UNIQUE)? INDEX\s+(?!IF NOT EXISTS)([a-z_]+)/gi)]
        .map((match) => match[1])
      expect(nonIdempotentIndexes).toEqual([])

      const nonReplaceableFunctions = [...sql.matchAll(/CREATE FUNCTION\s+([a-z_]+)/gi)]
        .map((match) => match[1])
      expect(nonReplaceableFunctions).toEqual([])
    }
  })

  it('protects org-scoped Agent Commerce rows with RLS and service-role writes', () => {
    expect(migration).toContain('ALTER TABLE %I ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('Users can view org agent commerce rows')
    expect(migration).toContain('org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())')
    expect(migration).toContain("auth.role() = ''service_role''")

    for (const table of foundationOrgScopedTables) {
      expect(migration).toContain(`'${table}'`)
    }

    expect(budgetMigration).toContain('ALTER TABLE agent_commerce_budget_reservations ENABLE ROW LEVEL SECURITY')
    expect(budgetMigration).toContain('Users can view org agent commerce budget reservations')
    expect(budgetMigration).toContain('WHERE user_id = auth.uid()')
    expect(budgetMigration).toContain("auth.role() = 'service_role'")

    expect(entitlementMigration).toContain('ALTER TABLE agent_commerce_seller_entitlements ENABLE ROW LEVEL SECURITY')
    expect(entitlementMigration).toContain('Users can view org agent commerce seller entitlements')
    expect(entitlementMigration).toContain('WHERE user_id = auth.uid()')
    expect(entitlementMigration).toContain("auth.role() = 'service_role'")
  })

  it('keeps non-org operational tables from becoming user-readable side channels', () => {
    expect(entitlementMigration).toContain('ALTER TABLE agent_commerce_rate_limit_buckets ENABLE ROW LEVEL SECURITY')
    expect(entitlementMigration).toContain('Service role manages agent commerce rate limit buckets')
    expect(entitlementMigration).not.toContain('Users can view org agent commerce rate limit buckets')

    expect(migration).toContain('Users can view provider health')
    expect(migration).toContain('ON agent_commerce_provider_health FOR SELECT')
    expect(migration).toContain('USING (true)')
    expect(migration).toContain('Service role manages provider health')
  })

  it('keeps migration dependencies ordered from ledger to operations to entitlements', () => {
    expect(allAgentCommerceSql.indexOf('CREATE TABLE IF NOT EXISTS seller_payment_grants'))
      .toBeLessThan(allAgentCommerceSql.indexOf('CREATE OR REPLACE FUNCTION fulfill_agent_commerce_seller_grant'))
    expect(allAgentCommerceSql.indexOf('CREATE TABLE IF NOT EXISTS agent_spend_requests'))
      .toBeLessThan(allAgentCommerceSql.indexOf('CREATE OR REPLACE FUNCTION reserve_agent_spend_budget'))
    expect(allAgentCommerceSql.indexOf('CREATE TABLE IF NOT EXISTS machine_payment_challenges'))
      .toBeLessThan(allAgentCommerceSql.indexOf('CREATE OR REPLACE FUNCTION claim_machine_payment_proof'))
  })

  it('reserves idempotency keys atomically by org, operation, and key', () => {
    expect(migration).toContain('idx_agent_commerce_idempotency_unique')
    expect(migration).toContain('ON CONFLICT (org_id, operation, idempotency_key) DO NOTHING')
    expect(migration).toContain('claim_agent_commerce_idempotency_key')
  })

  it('claims machine-payment proofs with a unique provider proof hash', () => {
    expect(migration).toContain('idx_machine_payment_proof_claims_provider_hash')
    expect(migration).toContain('ON CONFLICT (provider, proof_hash) DO NOTHING')
    expect(migration).toContain('claim_machine_payment_proof')
  })

  it('keeps machine-payment proof claims fail-closed after expiry', () => {
    expect(operationsMigration).toContain('CREATE OR REPLACE FUNCTION claim_machine_payment_proof')
    expect(operationsMigration).toContain("v_challenge.status = 'challenge_created' AND v_challenge.expires_at <= now()")
    expect(operationsMigration).toContain("SET status = 'expired'")
    expect(operationsMigration).toContain('WHERE c.challenge_id = p_challenge_id')
  })

  it('adds reconciliation primitives for operations', () => {
    expect(operationsMigration).toContain('agent_commerce_reconcile_org')
    expect(operationsMigration).toContain('credential_issuing_stuck')
    expect(operationsMigration).toContain('agent_commerce_provider_event_mismatches')
    expect(operationsMigration).toContain('agent_commerce_open_org_ids')
  })

  it('reserves and releases spend budget through transactional RPCs', () => {
    expect(budgetMigration).toContain('agent_commerce_budget_reservations')
    expect(budgetMigration).toContain('reserve_agent_spend_budget')
    expect(budgetMigration).toContain('ON CONFLICT (spend_request_id) DO NOTHING')
    expect(budgetMigration).toContain('release_agent_spend_budget')
    expect(budgetMigration).toContain('complete_agent_spend_request')
    expect(budgetMigration).toContain("status = 'captured'")
  })

  it('fulfills seller grants into entitlements and revokes them on reversals', () => {
    expect(entitlementMigration).toContain('agent_commerce_seller_entitlements')
    expect(entitlementMigration).toContain('fulfill_agent_commerce_seller_grant')
    expect(entitlementMigration).toContain('revoke_agent_commerce_seller_entitlement')
    expect(entitlementMigration).toContain("target_type IN ('subscription', 'payment', 'usage_metric', 'app_public_usage_bucket', 'generic')")
    expect(entitlementMigration).toContain("status = 'refunded'")
    expect(entitlementMigration).toContain("entitlement_ref = 'subscription:'")
  })

  it('claims Agent Commerce route rate limits atomically in postgres', () => {
    expect(entitlementMigration).toContain('agent_commerce_rate_limit_buckets')
    expect(entitlementMigration).toContain('claim_agent_commerce_rate_limit')
    expect(entitlementMigration).toContain('ON CONFLICT (scope_key, bucket_key, window_start) DO UPDATE')
    expect(entitlementMigration).toContain('v_current <= p_limit AS allowed')
  })

  it('indexes Commerce events by type for historical dashboard counts', () => {
    expect(dashboardCountsMigration).toContain('idx_agent_commerce_events_org_event_type_created')
    expect(dashboardCountsMigration).toContain('ON agent_commerce_events (org_id, event_type, created_at DESC)')
  })

  it('adds historical ledger aggregates for production dashboard metrics', () => {
    expect(dashboardLedgerMigration).toContain('agent_commerce_production_dashboard_ledger_aggregates')
    expect(dashboardLedgerMigration).toContain('idx_agent_spend_requests_org_currency_status')
    expect(dashboardLedgerMigration).toContain('idx_agent_commerce_budget_reservations_org_currency_status')
    expect(dashboardLedgerMigration).toContain('idx_seller_payment_grants_org_currency_status')
    expect(dashboardLedgerMigration).toContain("COUNT(*) FILTER (WHERE status = 'completed')")
    expect(dashboardLedgerMigration).toContain("status IN ('failed', 'declined', 'expired', 'cancelled')")
    expect(dashboardLedgerMigration).toContain("status IN ('revoked', 'expired')")
  })

  it('adds historical provider mismatch counts for production dashboard metrics', () => {
    expect(providerMismatchCountMigration).toContain('agent_commerce_provider_event_mismatch_count')
    expect(providerMismatchCountMigration).toContain('idx_agent_commerce_events_provider_mismatch_scan')
    expect(providerMismatchCountMigration).toContain("e.actor_type = 'provider'")
    expect(providerMismatchCountMigration).toContain("e.event_type NOT LIKE 'provider_health.%'")
    expect(providerMismatchCountMigration).toContain('COUNT(*)::BIGINT')
  })

  it('upserts provider connections atomically without cross-org reassignment', () => {
    expect(connectionUpsertMigration).toContain('upsert_agent_commerce_connection')
    expect(connectionUpsertMigration).toContain('ON CONFLICT (provider, provider_connection_id)')
    expect(connectionUpsertMigration).toContain('WHERE provider_connection_id IS NOT NULL')
    expect(connectionUpsertMigration).toContain('agent_commerce_connections.org_id = EXCLUDED.org_id')
    expect(connectionUpsertMigration).toContain('provider connection belongs to a different org')
  })
})
