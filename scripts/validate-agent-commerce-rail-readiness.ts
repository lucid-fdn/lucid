import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const errors: string[] = []

function read(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath)
  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath} is missing.`)
    return ''
  }
  return readFileSync(absolutePath, 'utf8')
}

function assertIncludes(source: string, phrase: string, label: string): void {
  if (!source.includes(phrase)) errors.push(`${label} must include "${phrase}".`)
}

const readiness = read('src/lib/agent-commerce/rail-readiness.ts')
for (const phrase of [
  'summarizeAgentCommerceRailReadiness',
  'has_live_agent_platform_rail',
  'has_live_seller_rail',
  "manifest.availability.mode !== 'live'",
]) {
  assertIncludes(readiness, phrase, 'Agent Commerce rail readiness core')
}

const readinessTest = read('src/lib/agent-commerce/__tests__/rail-readiness.test.ts')
for (const phrase of [
  'counts only live provider-adapter rails for GA readiness',
  "provider: 'manual'",
  "provider: 'stripe_link_agents'",
]) {
  assertIncludes(readinessTest, phrase, 'Agent Commerce rail readiness tests')
}

const api = read('src/app/api/mission-control/commerce/route.ts')
assertIncludes(api, 'rail_readiness', 'Mission Control Commerce API')
assertIncludes(api, 'summarizeAgentCommerceRailReadiness', 'Mission Control Commerce API')

const plan = read('docs/superpowers/plans/2026-05-01-agent-commerce-link-and-machine-payments-plan.md')
assertIncludes(plan, 'manual provider live rail', 'Agent Commerce plan')
assertIncludes(plan, 'external provider rails remain access gated', 'Agent Commerce plan')

const backlog = read('docs/BACKLOG.md')
assertIncludes(backlog, 'COMMERCE-P2-011 Add Agent Commerce live rail readiness classification', 'Agent Commerce backlog')

const packageJson = read('package.json')
assertIncludes(packageJson, '"agent-commerce:rail-readiness"', 'package.json')

const ci = read('.github/workflows/ci.yml')
assertIncludes(ci, 'npm run agent-commerce:rail-readiness', 'CI workflow')

if (errors.length > 0) {
  console.error('Agent Commerce rail readiness validation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Agent Commerce rail readiness is valid.')
