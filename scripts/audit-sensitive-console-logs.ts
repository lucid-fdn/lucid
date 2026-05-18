import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

type Finding = {
  file: string
  line: number
  text: string
  reason: string
}

const ROOT = process.cwd()
const STRICT = process.argv.includes('--strict')
const SCAN_ROOTS = ['src', 'worker/src', 'packages']
const ALLOWED_RELATIVE_PREFIXES = [
  `packages${path.sep}bridge-cli`,
  `packages${path.sep}openclaw-core`,
  `packages${path.sep}openclaw-runtime${path.sep}dist`,
]
const ALLOWED_SEGMENTS = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}.next${path.sep}`,
  `${path.sep}docs${path.sep}`,
]
const ALLOWED_SUFFIXES = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  '.json',
  '.md',
]
const CODE_SUFFIXES = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const CONSOLE_PATTERN = /\bconsole\.(log|debug|info|warn|error)\s*\(/
const SENSITIVE_PATTERN = /(authorization|bearer|cookie|csrf|email|payload|password|phone|profile|secret|session|token|userId|user_id|wallet|address)/i
const SANITIZED_PATTERN = /(Boolean|count|hash|has[A-Z_]|length|mask|redact|safe|sanitize|slice|substring|summarize|tokenHash)/i
const DYNAMIC_VALUE_PATTERN = /(\$\{|JSON\.stringify|console\.(?:log|debug|info|warn|error)\s*\([^)]*,)/

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0)
  throw error
})

function walk(dir: string, files: string[]) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const relative = path.relative(ROOT, full)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      const isAllowedPrefix = ALLOWED_RELATIVE_PREFIXES.some(
        (prefix) => relative === prefix || relative.startsWith(`${prefix}${path.sep}`),
      )
      if (!isAllowedPrefix && !ALLOWED_SEGMENTS.some((segment) => full.includes(segment))) {
        walk(full, files)
      }
      continue
    }

    if (!CODE_SUFFIXES.has(path.extname(full))) continue
    if (ALLOWED_SUFFIXES.some((suffix) => full.endsWith(suffix))) continue
    files.push(full)
  }
}

function inspectFile(file: string): Finding[] {
  const relative = path.relative(ROOT, file)
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines.flatMap((lineText, index) => {
    const trimmed = lineText.trim()
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return []
    if (!CONSOLE_PATTERN.test(lineText)) return []
    const statementParts: string[] = []
    let balance = 0
    for (const candidate of lines.slice(index, index + 12)) {
      statementParts.push(candidate.trim())
      for (const char of candidate) {
        if (char === '(') balance += 1
        if (char === ')') balance -= 1
      }
      if (balance <= 0 && statementParts.length > 1) break
    }
    const statement = statementParts.join(' ')
    if (!SENSITIVE_PATTERN.test(statement)) return []
    if (!DYNAMIC_VALUE_PATTERN.test(statement)) return []
    if (SANITIZED_PATTERN.test(statement)) return []
    return [{
      file: relative,
      line: index + 1,
      text: statement.trim().slice(0, 220),
      reason: 'sensitive-looking console log without obvious masking/redaction',
    }]
  })
}

const files: string[] = []
for (const root of SCAN_ROOTS) {
  walk(path.join(ROOT, root), files)
}

const findings = files.flatMap(inspectFile)

if (findings.length === 0) {
  console.log('Sensitive console log audit passed: no unsanitized candidates found.')
  process.exit(0)
}

console.log(`Sensitive console log audit found ${findings.length} candidate(s):`)
for (const finding of findings.slice(0, 80)) {
  console.log(`- ${finding.file}:${finding.line} ${finding.reason}`)
  console.log(`  ${finding.text}`)
}
if (findings.length > 80) {
  console.log(`...and ${findings.length - 80} more candidate(s).`)
}

if (STRICT) {
  process.exit(1)
}

console.log('Run with --strict to fail on candidates.')
