import type { AuditFinding, DependencyAuditItem } from './audit-types'
import { createFinding, readText, walkFiles } from './audit-utils'

const RISKY_RUNTIME_PACKAGES = [
  /puppeteer/i,
  /playwright/i,
  /browser/i,
  /eval/i,
  /vm2/i,
  /jsonwebtoken/i,
  /crypto/i,
  /stripe/i,
  /supabase/i,
  /redis/i,
  /nango/i,
]

export async function buildDependencyAudit(root: string): Promise<{
  items: DependencyAuditItem[]
  findings: AuditFinding[]
}> {
  const packageFiles = await walkFiles(root, {
    includeExtensions: ['package.json'],
    includeGlobs: [/^(package\.json|worker\/package\.json|packages\/[^/]+\/package\.json)$/],
  })
  const items: DependencyAuditItem[] = []
  const findings: AuditFinding[] = []

  for (const file of packageFiles) {
    const source = await readText(root, file)
    const parsed = JSON.parse(source) as Record<string, unknown>
    for (const kind of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
      const deps = parsed[kind] as Record<string, string> | undefined
      if (!deps) continue
      for (const [packageName, version] of Object.entries(deps)) {
        const riskNotes = dependencyRiskNotes(packageName, version, kind)
        const item: DependencyAuditItem = {
          file,
          packageName,
          version,
          kind: kind === 'dependencies'
            ? 'dependency'
            : kind === 'devDependencies'
              ? 'devDependency'
              : kind === 'peerDependencies'
                ? 'peerDependency'
                : 'optionalDependency',
          subsystem: classifyPackageFile(file),
          riskNotes,
        }
        items.push(item)

        if (riskNotes.some((note) => note.includes('unbounded version'))) {
          findings.push(createFinding({
            severity: 'P2',
            subsystem: 'dependency-audit',
            title: 'Dependency uses an unbounded version range',
            file,
            risk: 'Unbounded dependency ranges can make production builds non-reproducible and introduce supply-chain drift.',
            recommendation: 'Pin the dependency or use a bounded semver range managed by lockfile updates.',
            evidence: { packageName, version, kind },
          }))
        }
      }
    }
  }

  return { items, findings }
}

function dependencyRiskNotes(packageName: string, version: string, kind: string): string[] {
  const notes: string[] = []
  if (version === '*' || version === 'latest' || /^[><=]/.test(version)) {
    notes.push('unbounded version range')
  }
  if (kind === 'dependencies' && RISKY_RUNTIME_PACKAGES.some((pattern) => pattern.test(packageName))) {
    notes.push('sensitive runtime package; verify SCA advisories and runtime reachability')
  }
  if (/^(file:|link:)/.test(version)) {
    notes.push('local package reference; verify publish/deploy path includes it')
  }
  return notes
}

function classifyPackageFile(file: string): string {
  if (file === 'package.json') return 'app'
  if (file.startsWith('worker/')) return 'worker'
  if (file.startsWith('packages/')) return 'package'
  return 'unknown'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildDependencyAudit(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
