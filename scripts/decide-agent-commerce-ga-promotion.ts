import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaReleaseBundleSchema,
  decideAgentCommerceGaPromotion,
  verifyAgentCommerceGaReleaseBundle,
  type AgentCommerceGaReleaseBundleVerificationSource,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to decide Agent Commerce GA promotion.`)
  return trimmed
}

function targetEnvironment(): 'staging' | 'production' | undefined {
  const value = process.env.AGENT_COMMERCE_GA_PROMOTION_TARGET_ENVIRONMENT?.trim()
  if (!value) return undefined
  if (value === 'staging' || value === 'production') return value
  throw new Error('AGENT_COMMERCE_GA_PROMOTION_TARGET_ENVIRONMENT must be staging or production.')
}

function resolveInsideRepo(relativePath: string): string {
  const resolvedPath = path.resolve(path.join(repoRoot, relativePath))
  const repoRelative = path.relative(repoRoot, resolvedPath)

  if (repoRelative.startsWith('..') || path.isAbsolute(repoRelative)) {
    throw new Error(`Bundle source path must stay inside the repo: ${relativePath}`)
  }

  return resolvedPath
}

function actualSource(relativePath: string): AgentCommerceGaReleaseBundleVerificationSource | undefined {
  const absolutePath = resolveInsideRepo(relativePath)
  if (!existsSync(absolutePath)) return undefined

  const contents = readFileSync(absolutePath)
  const stats = statSync(absolutePath)
  return {
    path: relativePath,
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: stats.size,
  }
}

const bundleFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE,
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE',
)
const bundlePath = path.isAbsolute(bundleFile) ? bundleFile : path.join(repoRoot, bundleFile)
if (!existsSync(bundlePath)) {
  throw new Error(`AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE does not exist: ${bundleFile}`)
}

const bundle = AgentCommerceGaReleaseBundleSchema.parse(
  JSON.parse(readFileSync(bundlePath, 'utf8')),
)
const actualSources = bundle.source_files
  .map((source) => actualSource(source.path))
  .filter((source): source is AgentCommerceGaReleaseBundleVerificationSource => Boolean(source))
const verification = verifyAgentCommerceGaReleaseBundle(bundle, actualSources)
const decision = decideAgentCommerceGaPromotion({
  bundle,
  verification,
  targetEnvironment: targetEnvironment(),
  decidedAt: process.env.AGENT_COMMERCE_GA_PROMOTION_DECIDED_AT?.trim() || undefined,
})
const json = `${JSON.stringify(decision, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_PROMOTION_DECISION_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA promotion decision to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}

if (!decision.approved) {
  console.error('Agent Commerce GA promotion is blocked:')
  console.error(`- blockers=${decision.blockers.join(',') || 'none'}`)
  for (const gate of decision.gate_blockers) {
    console.error(`- gate ${gate.id}: missing evidence=${gate.missingEvidence.join(',') || 'none'} commands=${gate.missingCommands.join(',') || 'none'}`)
  }
  for (const provider of decision.provider_promotion_blockers) {
    console.error(`- provider ${provider.provider}: blockers=${provider.blockers.join(',') || 'none'} missing evidence=${provider.missingEvidence.join(',') || 'none'}`)
  }
}

if (truthy(process.env.AGENT_COMMERCE_GA_PROMOTION_REQUIRE_APPROVED) && !decision.approved) {
  process.exit(1)
}
