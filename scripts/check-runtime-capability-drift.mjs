#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const roots = [
  'worker/src/agent',
  'worker/src/runtime',
  'src/app/(app)',
  'src/components/mission-control',
  'packages/bridge-cli/src',
]

const skippedSegments = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}dist${path.sep}`,
]

const checks = [
  {
    name: 'hardcoded shared event source',
    pattern: /source:\s*['"]shared['"]/,
    allow: (file, line) =>
      file.endsWith('worker/src/runtime/event-reporter.ts') && line.includes("'shared' | 'relay' | 'native'"),
  },
  {
    name: 'hardcoded shared runtime flavor in runner path',
    pattern: /runtimeFlavor:\s*['"]shared['"]|runtime_flavor:\s*['"]shared['"]/,
    allow: (file) =>
      file.includes('src/components/') ||
      file.includes('src/app/(app)/') ||
      file.endsWith('worker/src/runtime/event-reporter.ts'),
  },
  {
    name: 'durable global HERMES_HOME write',
    pattern: /process\.env\.HERMES_HOME\s*=|HERMES_HOME\s*=\s*['"][^'"]+['"]/,
    allow: () => false,
  },
  {
    name: 'OpenClaw version used as primary UI identity',
    pattern: /if\s*\([^)]*openclaw[_A-Za-z.]*version[^)]*\)\s*console\.log|Version:\s*.*openclaw[_A-Za-z.]*version/i,
    allow: () => false,
  },
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (skippedSegments.some((segment) => full.includes(segment))) continue
    const info = statSync(full)
    if (info.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

const files = roots.flatMap((entry) => walk(path.join(root, entry)))
const failures = []

for (const full of files) {
  const rel = path.relative(root, full).replaceAll(path.sep, '/')
  const text = readFileSync(full, 'utf8')
  text.split(/\r?\n/).forEach((line, index) => {
    for (const check of checks) {
      if (check.pattern.test(line) && !check.allow(rel, line)) {
        failures.push(`${rel}:${index + 1} ${check.name}: ${line.trim()}`)
      }
    }
  })
}

if (failures.length > 0) {
  console.error('Runtime capability drift gate failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('Runtime capability drift gate passed')
