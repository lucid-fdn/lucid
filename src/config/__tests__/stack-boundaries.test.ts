import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LUCID_STACK_IDS, LucidStackIdSchema } from '@contracts/stack'
import { LUCID_STACK_DEFINITIONS } from '../lucid-stacks'

const repoRoot = process.cwd()
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

function importSources(source: string): string[] {
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[^'"`]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g,
    /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ]

  return patterns.flatMap((pattern) => (
    [...source.matchAll(pattern)].map((match) => match[1] ?? '')
  ))
}

function sourceMatchesImport(source: string, blocked: string): boolean {
  return source === blocked || source.startsWith(blocked) || source.includes(blocked)
}

describe('stack boundaries', () => {
  it('keeps stack IDs shared and rich stack metadata app-side', () => {
    expect(LucidStackIdSchema.parse('commerce')).toBe('commerce')
    expect(LUCID_STACK_DEFINITIONS.map((stack) => stack.id).sort()).toEqual([...LUCID_STACK_IDS].sort())

    const contractSource = readFileSync(path.join(repoRoot, 'contracts/stack.ts'), 'utf8')
    expect(contractSource).not.toContain('current_surfaces')
    expect(contractSource).not.toContain('forbidden_dependencies')
  })

  it('keeps shared contracts free of app, worker, and provider SDK imports', () => {
    const violations = sourceFiles('contracts').flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return importSources(source)
        .filter((importSource) => CONTRACT_FORBIDDEN_IMPORTS.some((blocked) => sourceMatchesImport(importSource, blocked)))
        .map((importSource) => `${path.relative(repoRoot, file)} imports ${importSource}`)
    })

    expect(violations).toEqual([])
  })

  it('keeps provider SDKs and control-plane modules out of worker runtime tools', () => {
    const violations = sourceFiles('worker/src/agent/runtime-tools').flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return importSources(source)
        .filter((importSource) => RUNTIME_TOOL_PROVIDER_IMPORTS.some((blocked) => sourceMatchesImport(importSource, blocked)))
        .map((importSource) => `${path.relative(repoRoot, file)} imports ${importSource}`)
    })

    expect(violations).toEqual([])
  })

  it('keeps Lucid-L2 P0 money-moving gateways unreachable from Agent Commerce execution paths', () => {
    const violations = AGENT_COMMERCE_EXECUTION_ROOTS.flatMap((root) => (
      sourceFiles(root).flatMap((file) => {
        const source = readFileSync(file, 'utf8')
        return LUCID_L2_P0_EXECUTION_MARKERS
          .filter((marker) => source.includes(marker))
          .map((marker) => `${path.relative(repoRoot, file)} references ${marker}`)
      })
    ))

    expect(violations).toEqual([])
  })

  it('keeps wallet signing unreachable from public Agent Commerce and generated-app routes', () => {
    const violations = PUBLIC_AGENT_COMMERCE_ROUTE_ROOTS.flatMap((root) => (
      sourceFiles(root).flatMap((file) => {
        const source = readFileSync(file, 'utf8')
        return WALLET_SIGNING_MARKERS
          .filter((marker) => source.includes(marker))
          .map((marker) => `${path.relative(repoRoot, file)} references ${marker}`)
      })
    ))

    expect(violations).toEqual([])
  })

  it('keeps crew-to-team migration gated and deliberate', () => {
    expect(existsSync(path.join(repoRoot, 'contracts/crew.ts'))).toBe(true)
    expect(existsSync(path.join(repoRoot, 'contracts/team.ts'))).toBe(false)

    const teamsDoc = readFileSync(path.join(repoRoot, 'docs/stacks/teams.md'), 'utf8')
    expect(teamsDoc).toContain('Migration Guardrails')
    expect(teamsDoc).toContain('Do not broadly rename DB tables or API routes from `crews` to `teams`')
  })

  it('keeps physical stack reorganization gated by ADR', () => {
    expect(existsSync(path.join(repoRoot, 'stacks'))).toBe(false)

    const stackReadme = readFileSync(path.join(repoRoot, 'docs/stacks/README.md'), 'utf8')
    expect(stackReadme).toContain('Reorg Decision')
    expect(stackReadme).toContain(STACK_REORG_ADR)
    expect(stackReadme).toContain('Do not split Agent Commerce into a separate repo')
    expect(stackReadme).toContain('Do not introduce a top-level physical `stacks/` directory yet')

    const reorgAdr = readFileSync(path.join(repoRoot, STACK_REORG_ADR), 'utf8')
    expect(reorgAdr).toContain('LucidMerged stays a single coherent monorepo for now')
    expect(reorgAdr).toContain('Agent Commerce must not be split into a separate repo')
    expect(reorgAdr).toContain('Broad physical moves are gated')
    expect(reorgAdr).toContain('Do not introduce a top-level physical `stacks/` layout yet')
  })

  it('keeps crew-to-team physical rename behind a compatibility migration plan', () => {
    const migrationSpec = readFileSync(path.join(repoRoot, CREW_TO_TEAM_MIGRATION_SPEC), 'utf8')

    expect(migrationSpec).toContain('Route Alias Preview')
    expect(migrationSpec).toContain('Response Shape Bridge')
    expect(migrationSpec).toContain('Optional DB View Layer')
    expect(migrationSpec).toContain('Physical Rename Decision')
    expect(migrationSpec).toContain('contracts/team.ts does not exist')
    expect(migrationSpec).toContain('/api/crews')
    expect(migrationSpec).toContain('/api/teams')
    expect(migrationSpec).toContain('crews`, `crew_members`, `crew_edges`, `crew_runs`, `crew_run_members')
  })
})
