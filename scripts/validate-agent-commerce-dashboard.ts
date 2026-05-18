import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const errors: string[] = []

function read(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath)
  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath} is missing.`)
    return ''
  }
  return readFileSync(absolutePath, 'utf8')
}

function assertIncludes(source: string, phrase: string, label: string): void {
  if (!source.includes(phrase)) errors.push(`${label} must include "${phrase}".`)
}

const metricsCore = read('src/lib/agent-commerce/dashboard-metrics.ts')
for (const phrase of [
  'summarizeAgentCommerceProductionDashboard',
  'AGENT_COMMERCE_DASHBOARD_EVENT_TYPES',
  'completed_volume',
  'eventCounts',
  'ledgerAggregates',
  'providerEventMismatchCount',
  'global_failure_count',
  'provider_mismatches',
  'provider_promotion_blocks',
  'replayed_proofs',
  'active_entitlements',
]) {
  assertIncludes(metricsCore, phrase, 'Agent Commerce dashboard metrics core')
}

const metricsTest = read('src/lib/agent-commerce/__tests__/dashboard-metrics.test.ts')
for (const phrase of [
  'summarizes spend, revenue, failures, replay, and provider health',
  'replay_rate',
  'global_failure_count',
  'provider_promotion_blocks',
  'uses durable event counts when recent dashboard events are capped',
  'uses durable ledger aggregates when recent ledger rows are capped',
  'uses durable provider mismatch counts when recent mismatch rows are capped',
  'classifies provider health failures as global rail health outside org failures',
]) {
  assertIncludes(metricsTest, phrase, 'Agent Commerce dashboard metrics tests')
}

const dbLayer = read('src/lib/db/agent-commerce.ts')
assertIncludes(dbLayer, 'listSellerPaymentGrants', 'Agent Commerce DB layer')
assertIncludes(dbLayer, 'eventType', 'Agent Commerce DB layer')
assertIncludes(dbLayer, 'countAgentCommerceEventsByType', 'Agent Commerce DB layer')
assertIncludes(dbLayer, "select('id', { count: 'exact', head: true })", 'Agent Commerce DB layer')
assertIncludes(dbLayer, 'getAgentCommerceProductionLedgerAggregates', 'Agent Commerce DB layer')
assertIncludes(dbLayer, 'agent_commerce_production_dashboard_ledger_aggregates', 'Agent Commerce DB layer')
assertIncludes(dbLayer, 'countAgentCommerceProviderEventMismatches', 'Agent Commerce DB layer')
assertIncludes(dbLayer, 'agent_commerce_provider_event_mismatch_count', 'Agent Commerce DB layer')

const route = read('src/app/api/mission-control/commerce/route.ts')
for (const phrase of [
  'AGENT_COMMERCE_DASHBOARD_EVENT_TYPES',
  'production_summary',
  'production_event_counts',
  'production_ledger_aggregates',
  'production_provider_mismatch_count',
  'summarizeAgentCommerceProductionDashboard',
  'countAgentCommerceEventsByType',
  'countAgentCommerceProviderEventMismatches',
  'getAgentCommerceProductionLedgerAggregates',
  'sellerGrants',
  'providerEventMismatches',
  'providerPromotionBlockEvents',
  'provider_promotion_block_events',
]) {
  assertIncludes(route, phrase, 'Mission Control Commerce API')
}

const client = read('src/app/(app)/[workspace-slug]/mission-control/commerce/commerce-client.tsx')
for (const phrase of [
  'Spend',
  'Revenue',
  'Failures',
  'Replays',
  'Providers',
  'AgentCommerceDashboardLedgerAggregates',
  'moneyRollupLabel',
  'providerHealthLabel',
  'global failures',
  'Promotion Blocks',
  'production_event_counts',
  'production_provider_mismatch_count',
  'provider_promotion_block_events',
  'provider_promotion.blocked',
]) {
  assertIncludes(client, phrase, 'Mission Control Commerce client')
}

const plan = read('docs/superpowers/plans/2026-05-01-agent-commerce-link-and-machine-payments-plan.md')
assertIncludes(plan, 'Production dashboard includes spend, failure, replay, provider health, and revenue metrics.', 'Agent Commerce plan')
assertIncludes(plan, 'summarizeAgentCommerceProductionDashboard', 'Agent Commerce plan')
assertIncludes(plan, 'production_ledger_aggregates', 'Agent Commerce plan')

const backlog = read('docs/BACKLOG.md')
assertIncludes(backlog, 'COMMERCE-P2-010 Add Agent Commerce production dashboard metrics', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-019 Add historical Agent Commerce dashboard event counts', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-020 Add historical Agent Commerce dashboard ledger aggregates', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-021 Add historical Agent Commerce provider mismatch counts', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-022 Classify provider health failures as global rail health', 'Agent Commerce backlog')

const dashboardCountsMigration = read('migrations/111_agent_commerce_dashboard_event_counts.sql')
assertIncludes(dashboardCountsMigration, 'idx_agent_commerce_events_org_event_type_created', 'Agent Commerce dashboard count migration')

const dashboardLedgerMigration = read('migrations/112_agent_commerce_dashboard_ledger_aggregates.sql')
assertIncludes(dashboardLedgerMigration, 'agent_commerce_production_dashboard_ledger_aggregates', 'Agent Commerce dashboard ledger migration')
assertIncludes(dashboardLedgerMigration, 'idx_agent_spend_requests_org_currency_status', 'Agent Commerce dashboard ledger migration')

const providerMismatchCountMigration = read('migrations/113_agent_commerce_provider_mismatch_count.sql')
assertIncludes(providerMismatchCountMigration, 'agent_commerce_provider_event_mismatch_count', 'Agent Commerce provider mismatch count migration')
assertIncludes(providerMismatchCountMigration, 'idx_agent_commerce_events_provider_mismatch_scan', 'Agent Commerce provider mismatch count migration')

const packageJson = read('package.json')
assertIncludes(packageJson, '"agent-commerce:dashboard"', 'package.json')

const ci = read('.github/workflows/ci.yml')
assertIncludes(ci, 'npm run agent-commerce:dashboard', 'CI workflow')

if (errors.length > 0) {
  console.error('Agent Commerce dashboard validation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Agent Commerce dashboard metrics are valid.')
