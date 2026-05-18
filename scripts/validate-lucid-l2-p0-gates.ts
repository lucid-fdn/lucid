import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const errors: string[] = []

function readRequired(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath)
  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath} is missing.`)
    return ''
  }
  return readFileSync(absolutePath, 'utf8')
}

function requireIncludes(relativePath: string, source: string, phrase: string): void {
  if (!source.includes(phrase)) {
    errors.push(`${relativePath} must include "${phrase}".`)
  }
}

function requireBacklogItemOpen(backlog: string, id: string): void {
  const pattern = new RegExp(`- \\[ \\] \\*\\*${id}\\b`)
  if (!pattern.test(backlog)) {
    errors.push(`docs/BACKLOG.md must keep ${id} open until the upstream Lucid-L2 issue is fixed and reviewed.`)
  }
}

const gateFilePath = 'src/lib/agent-commerce/lucid-l2-p0-gates.ts'
const gateFile = readRequired(gateFilePath)
for (const phrase of [
  'P0-L2-001',
  'P0-L2-002',
  'P0-L2-003',
  'AGENT_COMMERCE_LUCID_L2_EXECUTION_ENABLED',
  'AGENT_COMMERCE_LUCID_L2_P0_GATES_CLOSED',
  'AGENT_COMMERCE_LUCID_L2_SECURITY_REVIEW_REF',
  'assertLucidL2P0ExecutionGate',
  'lucid_l2_gate_open',
]) {
  requireIncludes(gateFilePath, gateFile, phrase)
}

const cryptoWalletPath = 'src/lib/agent-commerce/providers/crypto-wallet.ts'
const cryptoWallet = readRequired(cryptoWalletPath)
requireIncludes(cryptoWalletPath, cryptoWallet, 'assertLucidL2P0ExecutionGate')
requireIncludes(cryptoWalletPath, cryptoWallet, "surface: 'crypto_wallet_transfer'")

const indexPath = 'src/lib/agent-commerce/index.ts'
const index = readRequired(indexPath)
requireIncludes(indexPath, index, "export * from './lucid-l2-p0-gates'")

const gateTestPath = 'src/lib/agent-commerce/__tests__/lucid-l2-p0-gates.test.ts'
const gateTest = readRequired(gateTestPath)
for (const phrase of [
  'fails closed by default',
  'booleans alone',
  'required_env',
]) {
  requireIncludes(gateTestPath, gateTest, phrase)
}

const cryptoWalletTestPath = 'src/lib/agent-commerce/__tests__/crypto-wallet-provider.test.ts'
const cryptoWalletTest = readRequired(cryptoWalletTestPath)
for (const phrase of [
  'AGENT_COMMERCE_LUCID_L2_EXECUTION_ENABLED',
  'AGENT_COMMERCE_LUCID_L2_P0_GATES_CLOSED',
  'AGENT_COMMERCE_LUCID_L2_SECURITY_REVIEW_REF',
  'keeps wallet execution blocked until Lucid-L2 P0 gates are closed',
]) {
  requireIncludes(cryptoWalletTestPath, cryptoWalletTest, phrase)
}

const backlog = readRequired('docs/BACKLOG.md')
for (const id of ['P0-L2-001', 'P0-L2-002', 'P0-L2-003']) {
  requireBacklogItemOpen(backlog, id)
}
requireIncludes('docs/BACKLOG.md', backlog, 'P0-L2-000')
requireIncludes('docs/BACKLOG.md', backlog, 'LucidMerged local status: blocked by the P0 execution gate')

const commerceDoc = readRequired('docs/stacks/commerce.md')
for (const phrase of [
  'Lucid-L2 P0 Execution Gate',
  'AGENT_COMMERCE_LUCID_L2_EXECUTION_ENABLED',
  'AGENT_COMMERCE_LUCID_L2_P0_GATES_CLOSED',
  'AGENT_COMMERCE_LUCID_L2_SECURITY_REVIEW_REF',
]) {
  requireIncludes('docs/stacks/commerce.md', commerceDoc, phrase)
}

const providersDoc = readRequired('docs/stacks/providers.md')
requireIncludes('docs/stacks/providers.md', providersDoc, 'Lucid-L2-derived wallet or trading execution')

const packageJson = readRequired('package.json')
requireIncludes('package.json', packageJson, '"agent-commerce:l2-gates"')

const ci = readRequired('.github/workflows/ci.yml')
requireIncludes('.github/workflows/ci.yml', ci, 'npm run agent-commerce:l2-gates')

if (errors.length > 0) {
  console.error('Lucid-L2 P0 gate validation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Lucid-L2 P0 gates are valid.')
