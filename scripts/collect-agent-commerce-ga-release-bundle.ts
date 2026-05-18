import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaEvidenceInputFileSchema,
  createAgentCommerceGaReleaseBundle,
  type AgentCommerceGaReleaseBundleSourceFile,
  type AgentCommerceGaReleaseBundleSourceKind,
} from '../src/lib/agent-commerce/ga-release-bundle'
import {
  AgentCommerceProviderPromotionEvidenceSummarySchema,
} from '../src/lib/agent-commerce/provider-promotion'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function entries(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

function resolveInsideRepo(filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
  if (!existsSync(absolutePath)) throw new Error(`Evidence source does not exist: ${filePath}`)

  const relativePath = path.relative(repoRoot, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Evidence source must live inside the repo for a portable bundle: ${filePath}`)
  }

  return absolutePath
}

function repoRelative(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/')
}

function sourceFile(
  filePath: string,
  kind: AgentCommerceGaReleaseBundleSourceKind,
  provider?: string,
): AgentCommerceGaReleaseBundleSourceFile {
  const absolutePath = resolveInsideRepo(filePath)
  const contents = readFileSync(absolutePath)
  const stats = statSync(absolutePath)
  return {
    kind,
    path: repoRelative(absolutePath),
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: stats.size,
    ...(provider ? { provider: provider as AgentCommerceGaReleaseBundleSourceFile['provider'] } : {}),
  }
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to build an Agent Commerce GA release bundle.`)
  return trimmed
}

const gaEvidenceFile = required(process.env.AGENT_COMMERCE_GA_EVIDENCE_FILE, 'AGENT_COMMERCE_GA_EVIDENCE_FILE')
const gaEvidenceAbsolutePath = resolveInsideRepo(gaEvidenceFile)
const gaEvidence = AgentCommerceGaEvidenceInputFileSchema.parse(
  JSON.parse(readFileSync(gaEvidenceAbsolutePath, 'utf8')),
)

const sources: AgentCommerceGaReleaseBundleSourceFile[] = [
  sourceFile(gaEvidenceFile, 'ga_evidence'),
]

const stagingEvidenceFile = process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE?.trim()
if (stagingEvidenceFile) sources.push(sourceFile(stagingEvidenceFile, 'staging_reconciliation'))

const securityEvidenceFile = process.env.AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE?.trim()
if (securityEvidenceFile) sources.push(sourceFile(securityEvidenceFile, 'security_review'))

for (const providerEvidenceFile of entries(process.env.AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES)) {
  const absolutePath = resolveInsideRepo(providerEvidenceFile)
  const summary = AgentCommerceProviderPromotionEvidenceSummarySchema.parse(
    JSON.parse(readFileSync(absolutePath, 'utf8')),
  )
  sources.push(sourceFile(providerEvidenceFile, 'provider_promotion', summary.provider))
}

for (const supportingFile of entries(process.env.AGENT_COMMERCE_GA_RELEASE_SOURCE_FILES)) {
  sources.push(sourceFile(supportingFile, 'supporting'))
}

const bundle = createAgentCommerceGaReleaseBundle({
  generatedAt: process.env.AGENT_COMMERCE_GA_RELEASE_GENERATED_AT?.trim() || undefined,
  gaEvidence,
  sourceFiles: sources,
})

const json = `${JSON.stringify(bundle, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_RELEASE_BUNDLE_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA release bundle to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}

if (!bundle.ready) {
  console.error('Agent Commerce GA release bundle is not ready yet:')
  for (const result of bundle.ga_readiness.results.filter((item) => !item.ready)) {
    console.error(`- ${result.id}: missing evidence=${result.missingEvidence.join(',') || 'none'} commands=${result.missingCommands.join(',') || 'none'}`)
  }
  if (bundle.source_integrity.missingSourceKinds.length > 0) {
    console.error(`- missing source kinds=${bundle.source_integrity.missingSourceKinds.join(',')}`)
  }
  if (bundle.source_integrity.missingProviderPromotionSources.length > 0) {
    console.error(`- missing provider promotion sources=${bundle.source_integrity.missingProviderPromotionSources.join(',')}`)
  }
  if (bundle.source_integrity.duplicatePaths.length > 0) {
    console.error(`- duplicate source paths=${bundle.source_integrity.duplicatePaths.join(',')}`)
  }
  if (bundle.source_integrity.providerPromotionEnvironmentMismatches.length > 0) {
    for (const mismatch of bundle.source_integrity.providerPromotionEnvironmentMismatches) {
      console.error(`- provider promotion ${mismatch.provider} environment mismatch: expected=${mismatch.expected} actual=${mismatch.actual}`)
    }
  }
}

if (truthy(process.env.AGENT_COMMERCE_GA_RELEASE_BUNDLE_REQUIRE_READY) && !bundle.ready) {
  process.exit(1)
}
