import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaReleaseArtifactIndexSchema,
  AgentCommerceGaReleaseArtifactIndexVerificationResultSchema,
  AgentCommerceGaReleaseDossierSchema,
  verifyAgentCommerceGaReleaseDossier,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to verify an Agent Commerce GA release dossier.`)
  return trimmed
}

function absolutePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
}

function readTextFile(filePath: string, envName: string): string {
  const absolute = absolutePath(filePath)
  if (!existsSync(absolute)) throw new Error(`${envName} does not exist: ${filePath}`)
  return readFileSync(absolute, 'utf8')
}

function readJsonFile(filePath: string, envName: string): unknown {
  return JSON.parse(readTextFile(filePath, envName))
}

const dossierFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_FILE,
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_FILE',
)
const dossierMarkdownFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_FILE,
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_FILE',
)
const indexFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE,
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE',
)
const indexVerificationFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE,
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE',
)

const verification = verifyAgentCommerceGaReleaseDossier(
  AgentCommerceGaReleaseDossierSchema.parse(
    readJsonFile(dossierFile, 'AGENT_COMMERCE_GA_RELEASE_DOSSIER_FILE'),
  ),
  AgentCommerceGaReleaseArtifactIndexSchema.parse(
    readJsonFile(indexFile, 'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE'),
  ),
  AgentCommerceGaReleaseArtifactIndexVerificationResultSchema.parse(
    readJsonFile(indexVerificationFile, 'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE'),
  ),
  readTextFile(dossierMarkdownFile, 'AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_FILE'),
)

const json = `${JSON.stringify(verification, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce GA release dossier verification to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

if (!verification.ready) {
  console.error('Agent Commerce GA release dossier verification failed:')
  console.error(`- dossier ready=${verification.dossierReady}`)
  console.error(`- dossier hash valid=${verification.dossierHashValid}`)
  console.error(`- dossier self consistent=${verification.dossierSelfConsistent}`)
  console.error(`- dossier bound to index=${verification.dossierBoundToIndex}`)
  console.error(`- artifact index ready=${verification.artifactIndexReady}`)
  console.error(`- artifact index verification ready=${verification.artifactIndexVerificationReady}`)
  console.error(`- markdown matches=${verification.markdownMatches}`)
  console.error(`- expected blockers=${verification.expectedBlockers.join(',') || 'none'}`)
  console.error(`- actual blockers=${verification.actualBlockers.join(',') || 'none'}`)
  console.error(`- field mismatches=${verification.dossierFieldMismatches.join(',') || 'none'}`)
}

if (truthy(process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_REQUIRE_READY) && !verification.ready) {
  process.exit(1)
}
