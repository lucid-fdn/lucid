import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaReleaseArtifactIndexSchema,
  AgentCommerceGaReleaseArtifactIndexVerificationResultSchema,
  createAgentCommerceGaReleaseDossier,
  renderAgentCommerceGaReleaseDossierMarkdown,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to collect an Agent Commerce GA release dossier.`)
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

function publicLinks(value: string | undefined): Record<string, string> {
  const trimmed = value?.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AGENT_COMMERCE_GA_RELEASE_DOSSIER_LINKS_JSON must be a JSON object of public URLs.')
  }
  return parsed as Record<string, string>
}

const indexFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE,
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE',
)
const indexVerificationFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE,
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE',
)

const dossier = createAgentCommerceGaReleaseDossier({
  index: AgentCommerceGaReleaseArtifactIndexSchema.parse(
    readJsonFile(indexFile, 'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE'),
  ),
  verification: AgentCommerceGaReleaseArtifactIndexVerificationResultSchema.parse(
    readJsonFile(indexVerificationFile, 'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE'),
  ),
  generatedAt: process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_GENERATED_AT?.trim() || undefined,
  publicLinks: publicLinks(process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_LINKS_JSON),
})

const json = `${JSON.stringify(dossier, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce GA release dossier to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

const markdownOutput = process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_OUTPUT?.trim()
if (markdownOutput) {
  const absolute = absolutePath(markdownOutput)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, renderAgentCommerceGaReleaseDossierMarkdown(dossier))
  console.error(`Wrote Agent Commerce GA release dossier markdown to ${path.relative(repoRoot, absolute)}`)
}

if (!dossier.ready) {
  console.error('Agent Commerce GA release dossier is not ready:')
  console.error(`- blockers=${dossier.blockers.join(',') || 'none'}`)
  console.error(`- index hash=${dossier.index_hash}`)
  console.error(`- verification bound to index=${dossier.verification_bound_to_index}`)
}

if (truthy(process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_REQUIRE_READY) && !dossier.ready) {
  process.exit(1)
}
