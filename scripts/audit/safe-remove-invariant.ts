import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const allowedFiles = new Set([
  'packages/lucid-ops-safety/src/index.ts',
  'packages/hermes-runtime/src/index.ts',
  'worker/src/agent/OpenClawAgent.ts',
  'worker/src/agent/runtime-tools/subagent.ts',
  'worker/src/agent-ops/browser-qa/gateway/artifact-store.ts',
  'worker/src/channels/discord/voice-manager.ts',
  'worker/src/processors/voice-replies.ts',
  'worker/src/runtime/engine-home-lite.ts',
  'scripts/audit/safe-remove-invariant.ts',
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
  /\bfs\.rm(Sync)?\s*\(/,
  /\brm(Sync)?\s*\(/,
  /\brmdir(Sync)?\s*\(/,
  /\bunlink(Sync)?\s*\(/,
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
  console.error('Direct destructive filesystem operations found. Use @lucid/ops-safety planSafeRemove/executeSafeRemove for new product code.')
  for (const finding of findings.slice(0, 80)) {
    console.error(`- ${finding.file}:${finding.line} ${finding.text}`)
  }
  if (findings.length > 80) console.error(`...and ${findings.length - 80} more`)
  process.exit(1)
}

console.log('Safe-remove invariant passed: no unapproved direct destructive filesystem calls found.')

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) yield* walk(fullPath)
    else if (stat.isFile()) yield fullPath
  }
}
