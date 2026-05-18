import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectAgentCommerceGaEvidenceDraft,
  type AgentCommerceGaExternalEvidenceRefs,
} from '../src/lib/agent-commerce/ga-evidence-draft'
import { evaluateAgentCommerceGaEvidence } from '../src/lib/agent-commerce/ga-readiness'
import {
  AgentCommerceStagingReconciliationEvidenceSummarySchema,
} from '../src/lib/agent-commerce/staging-reconciliation-evidence'
import {
  AgentCommerceSecurityReviewEvidenceSummarySchema,
} from '../src/lib/agent-commerce/security-review-evidence'
import {
  AgentCommerceProviderPromotionEvidenceSummarySchema,
} from '../src/lib/agent-commerce/provider-promotion'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function releaseName(): string {
  return process.env.AGENT_COMMERCE_GA_RELEASE?.trim()
    || `agent-commerce-ga-${new Date().toISOString().slice(0, 10)}`
}

function environment(): 'staging' | 'production' {
  return process.env.AGENT_COMMERCE_GA_ENVIRONMENT === 'production' ? 'production' : 'staging'
}

function externalRefsFromEnv(): AgentCommerceGaExternalEvidenceRefs {
  return {
    reconciliationHistoryUrl: process.env.AGENT_COMMERCE_RECONCILIATION_HISTORY_URL,
    staleApprovalReconciliationUrl: process.env.AGENT_COMMERCE_STALE_APPROVAL_RECONCILIATION_URL,
    stuckCredentialReconciliationUrl: process.env.AGENT_COMMERCE_STUCK_CREDENTIAL_RECONCILIATION_URL,
    providerMismatchTriageUrl: process.env.AGENT_COMMERCE_PROVIDER_MISMATCH_TRIAGE_URL,
    incidentStatusUrl: process.env.AGENT_COMMERCE_INCIDENT_STATUS_URL,
    securityReviewUrl: process.env.AGENT_COMMERCE_SECURITY_REVIEW_URL,
    securityFindingsDispositionUrl: process.env.AGENT_COMMERCE_SECURITY_FINDINGS_DISPOSITION_URL,
    zeroOpenSecurityFindingsUrl: process.env.AGENT_COMMERCE_ZERO_OPEN_SECURITY_FINDINGS_URL,
  }
}

function readStagingReconciliationEvidence() {
  const filePath = process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE?.trim()
  if (!filePath) return undefined
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
  if (!existsSync(absolutePath)) {
    throw new Error(`AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE does not exist: ${filePath}`)
  }
  return AgentCommerceStagingReconciliationEvidenceSummarySchema.parse(
    JSON.parse(readFileSync(absolutePath, 'utf8')),
  )
}

function readSecurityReviewEvidence() {
  const filePath = process.env.AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE?.trim()
  if (!filePath) return undefined
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
  if (!existsSync(absolutePath)) {
    throw new Error(`AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE does not exist: ${filePath}`)
  }
  return AgentCommerceSecurityReviewEvidenceSummarySchema.parse(
    JSON.parse(readFileSync(absolutePath, 'utf8')),
  )
}

function readProviderPromotionEvidence() {
  const files = process.env.AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? []

  return files.map((filePath) => {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
    if (!existsSync(absolutePath)) {
      throw new Error(`AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES entry does not exist: ${filePath}`)
    }
    return AgentCommerceProviderPromotionEvidenceSummarySchema.parse(
      JSON.parse(readFileSync(absolutePath, 'utf8')),
    )
  })
}

const draft = collectAgentCommerceGaEvidenceDraft({
  environment: environment(),
  release: releaseName(),
  includeLocalEvidence: truthy(process.env.AGENT_COMMERCE_GA_LOCAL_CHECKS_PASSED),
  externalRefs: externalRefsFromEnv(),
  stagingReconciliation: readStagingReconciliationEvidence(),
  securityReview: readSecurityReviewEvidence(),
  providerPromotions: readProviderPromotionEvidence(),
  links: {
    ...(process.env.AGENT_COMMERCE_RELEASE_TICKET_URL
      ? { release_ticket: process.env.AGENT_COMMERCE_RELEASE_TICKET_URL }
      : {}),
    ...(process.env.AGENT_COMMERCE_DASHBOARD_URL
      ? { commerce_dashboard: process.env.AGENT_COMMERCE_DASHBOARD_URL }
      : {}),
  },
})

const report = evaluateAgentCommerceGaEvidence(draft)
const json = `${JSON.stringify(draft, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_EVIDENCE_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA evidence draft to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}

if (!report.ready) {
  console.error('Agent Commerce GA evidence draft is not ready yet:')
  for (const result of report.results.filter((item) => !item.ready)) {
    console.error(`- ${result.id}: missing evidence=${result.missingEvidence.join(',') || 'none'} commands=${result.missingCommands.join(',') || 'none'}`)
  }
}

if (truthy(process.env.AGENT_COMMERCE_GA_EVIDENCE_REQUIRE_READY) && !report.ready) {
  process.exit(1)
}
