import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AgentCommerceProviderIdSchema } from '@contracts/agent-commerce'
import {
  createAgentCommerceGaLaunchStatus,
  type AgentCommerceLucidL2P0ClosureId,
} from '../src/lib/agent-commerce/ga-launch-status'
import {
  AgentCommerceGaEvidenceInputFileSchema,
} from '../src/lib/agent-commerce/ga-release-bundle'
import {
  AgentCommerceGaFinalLocalGateSchema,
} from '../src/lib/agent-commerce/ga-final-local-gate'
import {
  AgentCommerceProviderPromotionEvidenceSummarySchema,
} from '../src/lib/agent-commerce/provider-promotion'
import {
  AgentCommerceSecurityReviewEvidenceSummarySchema,
} from '../src/lib/agent-commerce/security-review-evidence'
import {
  AgentCommerceStagingReconciliationEvidenceSummarySchema,
} from '../src/lib/agent-commerce/staging-reconciliation-evidence'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to collect Agent Commerce GA launch status.`)
  return trimmed
}

function absolutePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
}

function readJsonFile(filePath: string, envName: string): unknown {
  const absolute = absolutePath(filePath)
  if (!existsSync(absolute)) throw new Error(`${envName} does not exist: ${filePath}`)
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

function optionalJsonFile(value: string | undefined, envName: string): unknown | undefined {
  const trimmed = value?.trim()
  return trimmed ? readJsonFile(trimmed, envName) : undefined
}

function providerIds(value: string | undefined) {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => AgentCommerceProviderIdSchema.parse(item)) ?? []
}

function providerPromotionSummaries(value: string | undefined) {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((filePath) => AgentCommerceProviderPromotionEvidenceSummarySchema.parse(
      readJsonFile(filePath, 'AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES'),
    )) ?? []
}

function lucidL2ClosureUrls(value: string | undefined): Partial<Record<AgentCommerceLucidL2P0ClosureId, string>> {
  const trimmed = value?.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AGENT_COMMERCE_LUCID_L2_P0_CLOSURE_URLS_JSON must be a JSON object of closure URLs.')
  }
  return parsed as Partial<Record<AgentCommerceLucidL2P0ClosureId, string>>
}

const gaEvidenceFile = required(
  process.env.AGENT_COMMERCE_GA_EVIDENCE_FILE,
  'AGENT_COMMERCE_GA_EVIDENCE_FILE',
)
const finalLocalGateFile = required(
  process.env.AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE,
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE',
)
const stagingSummary = optionalJsonFile(
  process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE,
  'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE',
)
const securitySummary = optionalJsonFile(
  process.env.AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE,
  'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE',
)

const status = createAgentCommerceGaLaunchStatus({
  gaEvidence: AgentCommerceGaEvidenceInputFileSchema.parse(
    readJsonFile(gaEvidenceFile, 'AGENT_COMMERCE_GA_EVIDENCE_FILE'),
  ),
  finalLocalGate: AgentCommerceGaFinalLocalGateSchema.parse(
    readJsonFile(finalLocalGateFile, 'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE'),
  ),
  stagingReconciliation: stagingSummary
    ? AgentCommerceStagingReconciliationEvidenceSummarySchema.parse(stagingSummary)
    : undefined,
  securityReview: securitySummary
    ? AgentCommerceSecurityReviewEvidenceSummarySchema.parse(securitySummary)
    : undefined,
  providerPromotions: providerPromotionSummaries(process.env.AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES),
  requiredProviderPromotions: providerIds(process.env.AGENT_COMMERCE_GA_REQUIRED_PROVIDER_PROMOTIONS),
  requiresLucidL2Execution: truthy(process.env.AGENT_COMMERCE_GA_REQUIRE_LUCID_L2_EXECUTION),
  lucidL2P0ClosureUrls: lucidL2ClosureUrls(process.env.AGENT_COMMERCE_LUCID_L2_P0_CLOSURE_URLS_JSON),
  evaluatedAt: process.env.AGENT_COMMERCE_GA_LAUNCH_STATUS_EVALUATED_AT?.trim() || undefined,
})

const json = `${JSON.stringify(status, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_LAUNCH_STATUS_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce GA launch status to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

if (!status.ready) {
  console.error('Agent Commerce GA launch status is not ready:')
  console.error(`- blockers=${status.blockers.join(',') || 'none'}`)
  console.error(`- blocked GA gates=${status.ga_readiness.blocked_gate_ids.join(',') || 'none'}`)
  console.error(`- missing provider promotions=${status.provider_promotions.missing_required_provider_ids.join(',') || 'none'}`)
  console.error(`- blocked provider promotions=${status.provider_promotions.blocked_provider_ids.join(',') || 'none'}`)
  console.error(`- missing Lucid-L2 closures=${status.lucid_l2_execution.missing_closure_ids.join(',') || 'none'}`)
}

if (truthy(process.env.AGENT_COMMERCE_GA_LAUNCH_STATUS_REQUIRE_READY) && !status.ready) {
  process.exit(1)
}
