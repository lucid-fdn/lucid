import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaReleaseBundleSchema,
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
  if (!trimmed) throw new Error(`${name} is required to verify an Agent Commerce GA release bundle.`)
  return trimmed
}

function resolveInsideRepo(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath)
  const resolvedPath = path.resolve(absolutePath)
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
const json = `${JSON.stringify(verification, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA release bundle verification to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}

if (!verification.ready) {
  console.error('Agent Commerce GA release bundle verification failed:')
  if (!verification.bundleHashValid) {
    console.error(`- bundle hash mismatch: expected=${verification.expectedBundleHash} actual=${verification.actualBundleHash}`)
  }
  if (!verification.bundleSelfConsistent) {
    console.error('- bundle content is not self-consistent with recomputed GA readiness/source integrity')
  }
  if (!verification.gaReadinessReady) {
    console.error('- GA readiness report is not ready')
  }
  if (!verification.sourceIntegrityReady) {
    console.error('- source integrity report is not ready')
  }
  for (const source of verification.missingSourceFiles) {
    console.error(`- missing source file: ${source}`)
  }
  for (const mismatch of verification.sourceHashMismatches) {
    console.error(`- source hash mismatch for ${mismatch.path}: expected=${mismatch.expected} actual=${mismatch.actual}`)
  }
  for (const mismatch of verification.sourceByteMismatches) {
    console.error(`- source byte mismatch for ${mismatch.path}: expected=${mismatch.expected} actual=${mismatch.actual}`)
  }
}

if (truthy(process.env.AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_REQUIRE_READY) && !verification.ready) {
  process.exit(1)
}
