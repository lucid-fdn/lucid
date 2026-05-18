import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'])
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.turbo'])

const CONTRACT_FORBIDDEN_IMPORTS = [
  '@/',
  'src/',
  'worker/',
  'next/',
  'server-only',
  'stripe',
  '@x402/',
  '@solana/',
  'ethers',
  'coinbase-commerce-node',
]

const RUNTIME_TOOL_PROVIDER_IMPORTS = [
  '@/lib/agent-commerce',
  '@/lib/payments',
  '@/lib/session-signers',
  '@/lib/trading',
  'src/lib/agent-commerce',
  'src/lib/payments',
  'stripe',
  '@x402/',
  '@solana/',
  'ethers',
  'coinbase-commerce-node',
]

const AGENT_COMMERCE_EXECUTION_ROOTS = [
  'src/lib/agent-commerce',
  'src/app/api/agent-commerce',
  'src/app/api/internal/agent-commerce',
  'src/app/api/mission-control/commerce',
  'src/app/api/webhooks/agent-commerce',
  'src/app/api/webhooks/stripe/agent-commerce',
  'worker/src/services/agent-commerce',
  'worker/src/agent/runtime-tools',
]

const PUBLIC_AGENT_COMMERCE_ROUTE_ROOTS = [
  'src/app/api/agent-commerce',
  'src/app/api/webhooks/agent-commerce',
  'src/app/api/webhooks/stripe/agent-commerce',
  'src/app/api/app-runtime',
  'src/app/apps',
]

const WALLET_SIGNING_MARKERS = [
  '@/lib/session-signers',
  'src/lib/session-signers',
  'executeAgentWalletTransaction',
  'executeAutonomousTransaction',
  'signAgentWalletTypedData',
  'privy_wallet_id',
]

const LUCID_L2_P0_EXECUTION_MARKERS = [
  '@/lib/lucid-l2',
  'src/lib/lucid-l2',
  'Lucid-L2/offchain/packages/gateway-lite/src/routes/chain/solanaRoutes',
  'Lucid-L2/offchain/packages/gateway-lite/src/routes/contrib/hyperliquidRoutes',
  'Lucid-L2/offchain/packages/engine/src/identity/passport/passportManager',
  'solanaRoutes',
  'hyperliquidRoutes',
  'passportManager',
  'SOLANA_PRIVATE_KEY',
  'gateway-lite/src/routes/chain',
  'gateway-lite/src/routes/contrib',
  '/chain/solana',
  '/contrib/hyperliquid',
]

const STACK_REORG_ADR = 'docs/superpowers/adrs/2026-05-02-stack-architecture-and-reorg-gates.md'
const CREW_TO_TEAM_MIGRATION_SPEC = 'docs/superpowers/specs/2026-05-02-crew-to-team-compatibility-migration.md'

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP_DIRS.has(entry)) return []
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)
    return stats.isDirectory() ? walk(fullPath) : [fullPath]
  })
}

function sourceFiles(root: string): string[] {
  return walk(path.join(repoRoot, root))
    .filter((file) => EXTENSIONS.has(path.extname(file)))
    .sort()
}

function toRepoPath(file: string): string {
  return path.relative(repoRoot, file).replaceAll(path.sep, '/')
}

function importSources(source: string): Array<{ source: string; index: number }> {
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[^'"`]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g,
    /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ]

  return patterns.flatMap((pattern) => (
    [...source.matchAll(pattern)].map((match) => ({
      source: match[1] ?? '',
      index: match.index ?? 0,
    }))
  ))
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function sourceMatchesImport(source: string, blocked: string): boolean {
  return source === blocked || source.startsWith(blocked) || source.includes(blocked)
}

const errors: string[] = []

for (const absoluteFile of sourceFiles('contracts')) {
  const file = toRepoPath(absoluteFile)
  const source = readFileSync(absoluteFile, 'utf8')
  for (const item of importSources(source)) {
    const blocked = CONTRACT_FORBIDDEN_IMPORTS.find((candidate) => sourceMatchesImport(item.source, candidate))
    if (blocked) {
      errors.push(`Shared contract ${file}:${lineOf(source, item.index)} imports forbidden boundary "${item.source}".`)
    }
  }
}

for (const absoluteFile of sourceFiles('worker/src/agent/runtime-tools')) {
  const file = toRepoPath(absoluteFile)
  const source = readFileSync(absoluteFile, 'utf8')
  for (const item of importSources(source)) {
    const blocked = RUNTIME_TOOL_PROVIDER_IMPORTS.find((candidate) => sourceMatchesImport(item.source, candidate))
    if (blocked) {
      errors.push(`Runtime tool ${file}:${lineOf(source, item.index)} imports provider/control-plane SDK "${item.source}". Use an internal Lucid API client instead.`)
    }
  }
}

for (const root of AGENT_COMMERCE_EXECUTION_ROOTS) {
  for (const absoluteFile of sourceFiles(root)) {
    const file = toRepoPath(absoluteFile)
    const source = readFileSync(absoluteFile, 'utf8')
    for (const marker of LUCID_L2_P0_EXECUTION_MARKERS) {
      if (source.includes(marker)) {
        errors.push(`Agent Commerce execution path ${file} references Lucid-L2 P0 money-moving marker "${marker}". Keep Lucid-L2 public gateway routes physically unreachable until P0-L2 gates close.`)
      }
    }
  }
}

for (const root of PUBLIC_AGENT_COMMERCE_ROUTE_ROOTS) {
  for (const absoluteFile of sourceFiles(root)) {
    const file = toRepoPath(absoluteFile)
    const source = readFileSync(absoluteFile, 'utf8')
    for (const marker of WALLET_SIGNING_MARKERS) {
      if (source.includes(marker)) {
        errors.push(`Public Agent Commerce/generated-app route ${file} references wallet signing marker "${marker}". Keep wallet signing behind internal HMAC routes and provider-neutral spend requests.`)
      }
    }
  }
}

const stackContract = readFileSync(path.join(repoRoot, 'contracts/stack.ts'), 'utf8')
if (stackContract.includes('owns:') || stackContract.includes('current_surfaces') || stackContract.includes('forbidden_dependencies')) {
  errors.push('contracts/stack.ts must remain a small shared ID contract; rich metadata belongs in src/config/lucid-stacks.ts.')
}

if (!existsSync(path.join(repoRoot, 'src/config/lucid-stacks.ts'))) {
  errors.push('src/config/lucid-stacks.ts is required for rich app-side stack metadata.')
}

if (existsSync(path.join(repoRoot, 'stacks'))) {
  errors.push('Do not introduce a top-level physical stacks/ layout until the stack reorg ADR gates are satisfied. Use docs/stacks/ as the logical map.')
}

const reorgAdrPath = path.join(repoRoot, STACK_REORG_ADR)
if (!existsSync(reorgAdrPath)) {
  errors.push(`${STACK_REORG_ADR} is required before broad stack/repo reorganization decisions change.`)
} else {
  const reorgAdr = readFileSync(reorgAdrPath, 'utf8')
  for (const requiredPhrase of [
    'LucidMerged stays a single coherent monorepo for now',
    'Agent Commerce must not be split into a separate repo',
    'Do not introduce a top-level physical `stacks/` layout yet',
    'Broad physical moves are gated',
  ]) {
    if (!reorgAdr.includes(requiredPhrase)) {
      errors.push(`${STACK_REORG_ADR} must document: ${requiredPhrase}`)
    }
  }
}

if (existsSync(path.join(repoRoot, 'contracts/team.ts'))) {
  errors.push('contracts/team.ts should not be introduced until the crew-to-team compatibility migration is explicitly planned.')
}

const teamsDoc = readFileSync(path.join(repoRoot, 'docs/stacks/teams.md'), 'utf8')
if (!teamsDoc.includes('Migration Guardrails') || !teamsDoc.includes('Do not broadly rename DB tables or API routes from `crews` to `teams`')) {
  errors.push('docs/stacks/teams.md must keep the crew-to-team migration guardrails explicit.')
}

const crewToTeamSpecPath = path.join(repoRoot, CREW_TO_TEAM_MIGRATION_SPEC)
if (!existsSync(crewToTeamSpecPath)) {
  errors.push(`${CREW_TO_TEAM_MIGRATION_SPEC} is required before any crew-to-team physical rename.`)
} else {
  const crewToTeamSpec = readFileSync(crewToTeamSpecPath, 'utf8')
  for (const requiredPhrase of [
    'Route Alias Preview',
    'Response Shape Bridge',
    'Optional DB View Layer',
    'Physical Rename Decision',
    'contracts/team.ts does not exist',
  ]) {
    if (!crewToTeamSpec.includes(requiredPhrase)) {
      errors.push(`${CREW_TO_TEAM_MIGRATION_SPEC} must document: ${requiredPhrase}`)
    }
  }
}

if (errors.length > 0) {
  console.error('Stack boundary validation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Stack boundaries are valid.')
