import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const allowedFiles = new Set([
  'packages/lucid-ops-safety/src/index.ts',
  'packages/bridge-cli/src/cli/commands.ts',
  'packages/hermes-runtime/src/index.ts',
  'worker/src/agent/engines/hermes/HermesLauncher.ts',
  'worker/src/agent/skills/import-openclaw-skills.ts',
  'worker/src/runtime/capability-report.ts',
  'worker/src/railway-entrypoint.ts',
  'scripts/audit/external-exec-invariant.ts',
])
const ignoredDirs = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'coverage', '.turbo'])
const ignoredPathSegments = [
  '/__tests__/',
  '/test/',
  '/tests/',
  '/scripts/',
  '/packages/openclaw-core/',
  '/worker/scripts/',
]
const patterns = [
  /\bfrom\s+['"]node:child_process['"]/,
  /\bfrom\s+['"]child_process['"]/,
  /\brequire\(['"]node:child_process['"]\)/,
  /\brequire\(['"]child_process['"]\)/,
  /\bspawn(Sync)?\s*\(/,
]

const findings: Array<{ file: string; line: number; text: string }> = []

for (const file of walk(repoRoot)) {
  const relative = path.relative(repoRoot, file)
  if (!/\.(mjs|cjs|js|jsx|ts|tsx)$/.test(relative)) continue
  const normalized = `/${relative}`
  if (ignoredPathSegments.some((segment) => normalized.includes(segment))) continue
  if (allowedFiles.has(relative)) continue
  const source = readFileSync(file, 'utf8')
  const lines = source.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (patterns.some((pattern) => pattern.test(line))) {
      findings.push({ file: relative, line: index + 1, text: line.trim().slice(0, 160) })
    }
  })
}

if (findings.length > 0) {
  console.error('Direct external process execution found. Use @lucid/ops-safety runTrustedCommand for new code.')
  for (const finding of findings.slice(0, 80)) {
    console.error(`- ${finding.file}:${finding.line} ${finding.text}`)
  }
  if (findings.length > 80) console.error(`...and ${findings.length - 80} more`)
  process.exit(1)
}

console.log('External exec invariant passed: no unapproved direct child_process usage found.')

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) yield* walk(fullPath)
    else if (stat.isFile()) yield fullPath
  }
}
