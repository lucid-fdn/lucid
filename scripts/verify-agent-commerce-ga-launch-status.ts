import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaLaunchStatusSchema,
  verifyAgentCommerceGaLaunchStatus,
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
  if (!trimmed) throw new Error(`${name} is required to verify Agent Commerce GA launch status.`)
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

function providerPromotionSummaries(value: string | undefined) {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((filePath) => AgentCommerceProviderPromotionEvidenceSummarySchema.parse(
      readJsonFile(filePath, 'AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES'),
    )) ?? []
}

const launchStatusFile = required(
  process.env.AGENT_COMMERCE_GA_LAUNCH_STATUS_FILE,
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_FILE',
)
const gaEvidenceFile = required(
  process.env.AGENT_COMMERCE_GA_EVIDENCE_FILE,
  'AGENT_COMMERCE_GA_EVIDENCE_FILE',
)
const finalLocalGateFile = required(
  process.env.AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE,
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE',
)
const stagingReconciliationFile = required(
  process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE,
  'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE',
)
const securityReview = optionalJsonFile(
  process.env.AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE,
  'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE',
)

const verification = verifyAgentCommerceGaLaunchStatus(
  AgentCommerceGaLaunchStatusSchema.parse(
    readJsonFile(launchStatusFile, 'AGENT_COMMERCE_GA_LAUNCH_STATUS_FILE'),
  ),
  {
    gaEvidence: AgentCommerceGaEvidenceInputFileSchema.parse(
      readJsonFile(gaEvidenceFile, 'AGENT_COMMERCE_GA_EVIDENCE_FILE'),
    ),
    finalLocalGate: AgentCommerceGaFinalLocalGateSchema.parse(
      readJsonFile(finalLocalGateFile, 'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE'),
    ),
    stagingReconciliation: AgentCommerceStagingReconciliationEvidenceSummarySchema.parse(
      readJsonFile(stagingReconciliationFile, 'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE'),
    ),
    securityReview: securityReview
      ? AgentCommerceSecurityReviewEvidenceSummarySchema.parse(securityReview)
      : undefined,
    providerPromotions: providerPromotionSummaries(process.env.AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES),
  },
)

const json = `${JSON.stringify(verification, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce GA launch status verification to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

if (!verification.ready) {
  console.error('Agent Commerce GA launch status verification failed:')
  console.error(`- launch status ready=${verification.launchStatusReady}`)
  console.error(`- launch status hash valid=${verification.launchStatusHashValid}`)
  console.error(`- launch status self consistent=${verification.launchStatusSelfConsistent}`)
  console.error(`- final local gate ready=${verification.finalLocalGateReady}`)
  console.error(`- GA readiness ready=${verification.gaReadinessReady}`)
  console.error(`- staging reconciliation ready=${verification.stagingReconciliationReady}`)
  console.error(`- external security review ready=${verification.externalSecurityReviewReady}`)
  console.error(`- required provider promotions ready=${verification.requiredProviderPromotionsReady}`)
  console.error(`- Lucid-L2 execution ready=${verification.lucidL2ExecutionReady}`)
  console.error(`- expected blockers=${verification.expectedBlockers.join(',') || 'none'}`)
  console.error(`- actual blockers=${verification.actualBlockers.join(',') || 'none'}`)
  console.error(`- field mismatches=${verification.launchStatusFieldMismatches.join(',') || 'none'}`)
}

if (truthy(process.env.AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_REQUIRE_READY) && !verification.ready) {
  process.exit(1)
}
