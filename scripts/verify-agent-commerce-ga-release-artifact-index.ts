import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGENT_COMMERCE_GA_RELEASE_ARTIFACT_SECRET_MARKERS,
  AgentCommerceGaReleaseArtifactIndexSchema,
  verifyAgentCommerceGaReleaseArtifactIndex,
  type AgentCommerceGaReleaseArtifact,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to verify an Agent Commerce GA release artifact index.`)
  return trimmed
}

function absolutePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
}

function actualArtifact(expected: AgentCommerceGaReleaseArtifact): AgentCommerceGaReleaseArtifact | undefined {
  const absolute = absolutePath(expected.path)
  if (!existsSync(absolute)) return undefined

  const contents = readFileSync(absolute)
  const text = contents.toString('utf8')
  const stats = statSync(absolute)
  const secretMarkers = AGENT_COMMERCE_GA_RELEASE_ARTIFACT_SECRET_MARKERS
    .filter((marker) => text.includes(marker))

  return {
    kind: expected.kind,
    path: expected.path,
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: stats.size,
    secret_markers_found: secretMarkers,
  }
}

const indexFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE,
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE',
)
const indexPath = absolutePath(indexFile)
if (!existsSync(indexPath)) {
  throw new Error(`AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE does not exist: ${indexFile}`)
}

const index = AgentCommerceGaReleaseArtifactIndexSchema.parse(
  JSON.parse(readFileSync(indexPath, 'utf8')),
)
const verification = verifyAgentCommerceGaReleaseArtifactIndex(
  index,
  index.artifacts
    .map((artifact) => actualArtifact(artifact))
    .filter((artifact): artifact is AgentCommerceGaReleaseArtifact => Boolean(artifact)),
)

const json = `${JSON.stringify(verification, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce GA release artifact index verification to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

if (!verification.ready) {
  console.error('Agent Commerce GA release artifact index verification failed:')
  console.error(`- index ready=${verification.indexReady}`)
  console.error(`- index hash valid=${verification.indexHashValid}`)
  console.error(`- index metadata self consistent=${verification.indexMetadataSelfConsistent}`)
  console.error(`- artifact files present=${verification.artifactFilesPresent}`)
  console.error(`- artifact hashes valid=${verification.artifactHashesValid}`)
  console.error(`- artifact secret markers valid=${verification.artifactSecretMarkersValid}`)
  console.error(`- no artifact secret markers=${verification.noArtifactSecretMarkers}`)
  for (const missing of verification.missingArtifactPaths) {
    console.error(`- missing artifact file: ${missing}`)
  }
  for (const mismatch of verification.artifactHashMismatches) {
    console.error(`- artifact hash mismatch for ${mismatch.path}: expected=${mismatch.expected} actual=${mismatch.actual}`)
  }
  for (const mismatch of verification.artifactByteMismatches) {
    console.error(`- artifact byte mismatch for ${mismatch.path}: expected=${mismatch.expected} actual=${mismatch.actual}`)
  }
  for (const mismatch of verification.artifactSecretMarkerMismatches) {
    console.error(`- artifact secret marker mismatch for ${mismatch.path}: expected=${mismatch.expected.join(',') || 'none'} actual=${mismatch.actual.join(',') || 'none'}`)
  }
}

if (truthy(process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_REQUIRE_READY) && !verification.ready) {
  process.exit(1)
}
