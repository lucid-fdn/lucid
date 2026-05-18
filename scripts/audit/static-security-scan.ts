import type { AuditFinding, AuditSeverity, StaticSecurityScanItem } from './audit-types'
import { createFinding, lineNumberForOffset, readText, walkFiles } from './audit-utils'

const SECURITY_PATTERNS: Array<{
  name: string
  pattern: RegExp
  severity: AuditSeverity
  recommendation: string
  allow?: (file: string, source: string, match: RegExpMatchArray) => boolean
}> = [
  {
    name: 'dangerouslySetInnerHTML',
    pattern: /\bdangerouslySetInnerHTML\b/g,
    severity: 'P2',
    recommendation: 'Use a safe renderer or prove the HTML is sanitized and static.',
    allow: (file) => file.includes('__tests__') || file.includes('static') || file.includes('shiki'),
  },
  {
    name: 'innerHTML',
    pattern: /\.innerHTML\b/g,
    severity: 'P2',
    recommendation: 'Prefer textContent or a sanitized HTML renderer.',
    allow: (file) => file.includes('__tests__') || file.includes('scripts/'),
  },
  {
    name: 'eval',
    pattern: /(?<!\.)\beval\s*\(/g,
    severity: 'P2',
    recommendation: 'Avoid eval in runtime code; isolate in sandboxed/dev-only tooling if unavoidable.',
    allow: (file, source, match) => isTestOrFixture(file) || file.includes('scripts/audit/') || lineForMatch(source, match).includes('not allowed'),
  },
  {
    name: 'new Function',
    pattern: /\bnew\s+Function\b/g,
    severity: 'P2',
    recommendation: 'Avoid dynamic code execution outside a sandboxed runtime.',
    allow: (file, source, match) => isTestOrFixture(file) || file.includes('scripts/') || lineForMatch(source, match).includes('not allowed'),
  },
  {
    name: 'child_process',
    pattern: /from\s+['"]node:child_process['"]|require\(['"](?:node:)?child_process['"]\)/g,
    severity: 'P2',
    recommendation: 'Keep command execution in scripts or tightly scoped server-only tooling with fixed argv.',
    allow: (file) => file.startsWith('scripts/') || file.includes('/scripts/') || isTestOrFixture(file) || file.includes('test-helpers'),
  },
  {
    name: 'private-network fetch allow',
    pattern: /ALLOW_PRIVATE_NETWORK|allowPrivateNetwork|privateNetwork/i,
    severity: 'P2',
    recommendation: 'Private-network access must stay default-deny and gated by Browser Operator policy.',
    allow: (file) => isTestOrFixture(file),
  },
  {
    name: 'raw SQL interpolation',
    pattern: /\b(sql|query|execute)\s*`[^`]*\$\{/g,
    severity: 'P1',
    recommendation: 'Use parameterized SQL helpers; never interpolate user-controlled values.',
    allow: (file) => isTestOrFixture(file),
  },
]

export async function buildStaticSecurityScan(root: string): Promise<{
  items: StaticSecurityScanItem[]
  findings: AuditFinding[]
}> {
  const files = await walkFiles(root, {
    includeExtensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'],
    includeGlobs: [/^(src|worker|packages|scripts|tests)\//],
  })
  const items: StaticSecurityScanItem[] = []
  const findings: AuditFinding[] = []

  for (const file of files) {
    const source = await readText(root, file).catch(() => '')
    const reportedRules = new Set<string>()
    for (const rule of SECURITY_PATTERNS) {
      for (const match of source.matchAll(toGlobalPattern(rule.pattern))) {
        if (rule.allow?.(file, source, match)) continue
        const line = lineNumberForOffset(source, match.index ?? 0)
        const snippet = source.split('\n')[line - 1]?.trim().slice(0, 240) ?? ''
        const item: StaticSecurityScanItem = {
          file,
          line,
          pattern: rule.name,
          severity: rule.severity,
          snippet,
          recommendation: rule.recommendation,
        }
        items.push(item)
        const findingKey = `${file}:${rule.name}`
        if (!reportedRules.has(findingKey)) {
          reportedRules.add(findingKey)
          findings.push(createFinding({
            severity: rule.severity,
            subsystem: 'static-security',
            title: `Security-sensitive pattern: ${rule.name}`,
            file,
            line,
            risk: `${rule.name} is security-sensitive and should be reviewed before release.`,
            recommendation: rule.recommendation,
            evidence: { snippet },
          }))
        }
      }
    }
  }

  return { items, findings }
}

function toGlobalPattern(pattern: RegExp): RegExp {
  return pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`)
}

function isTestOrFixture(file: string): boolean {
  return file.includes('__tests__') || file.startsWith('tests/') || /\.test\.[cm]?[jt]sx?$/.test(file)
}

function lineForMatch(source: string, match: RegExpMatchArray): string {
  const line = lineNumberForOffset(source, match.index ?? 0)
  return source.split('\n')[line - 1] ?? ''
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildStaticSecurityScan(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
