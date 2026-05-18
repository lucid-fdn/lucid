import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceSecurityReviewPacketSchema,
  summarizeAgentCommerceSecurityReviewEvidence,
} from '../src/lib/agent-commerce/security-review-evidence'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function absolutePath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value)
}

const packetFile = process.env.AGENT_COMMERCE_SECURITY_REVIEW_PACKET_FILE?.trim()
if (!packetFile) {
  console.error('AGENT_COMMERCE_SECURITY_REVIEW_PACKET_FILE is required.')
  process.exit(1)
}

const packetPath = absolutePath(packetFile)
if (!existsSync(packetPath)) {
  console.error(`Agent Commerce security review packet does not exist: ${packetFile}`)
  process.exit(1)
}

const packet = AgentCommerceSecurityReviewPacketSchema.parse(
  JSON.parse(readFileSync(packetPath, 'utf8')),
)
const summary = summarizeAgentCommerceSecurityReviewEvidence(packet)
const json = `${JSON.stringify(summary, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce security review evidence to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

if (!summary.ready) {
  console.error('Agent Commerce security review evidence is not ready yet:')
  console.error(`- missing evidence=${summary.missingEvidence.join(',') || 'none'}`)
  console.error(`- missing scope=${summary.missing_scope.join(',') || 'none'}`)
  console.error(`- open P0/P1 findings=${summary.findings.open_p0_p1}`)
}

if (truthy(process.env.AGENT_COMMERCE_SECURITY_REVIEW_REQUIRE_READY) && !summary.ready) {
  process.exit(1)
}
