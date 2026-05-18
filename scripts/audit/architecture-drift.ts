import path from 'node:path'

import type { AuditFinding, CodeCleanupInventoryItem } from './audit-types'
import { createFinding, readText, walkFiles } from './audit-utils'

export async function buildArchitectureDriftInventory(root: string): Promise<{
  items: CodeCleanupInventoryItem[]
  findings: AuditFinding[]
}> {
  const files = await walkFiles(root, {
    includeExtensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'],
    includeGlobs: [/^(src|worker|packages|scripts|contracts|tests)\//],
  })
  const items: CodeCleanupInventoryItem[] = []
  const findings: AuditFinding[] = []

  const basenameGroups = new Map<string, string[]>()
  for (const file of files) {
    const basename = path.basename(file).replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '').replace(/\.(ts|tsx|js|jsx|mts|mjs)$/, '')
    const group = basenameGroups.get(basename) ?? []
    group.push(file)
    basenameGroups.set(basename, group)
  }

  for (const file of files) {
    const source = await readText(root, file).catch(() => '')
    const firstLine = source.split('\n').slice(0, 5).join('\n')
    const subsystem = classifySubsystem(file)

    if (/['"]use client['"]/.test(firstLine) && /server-only|SUPABASE_SERVICE_ROLE_KEY|createServiceRole|@\/lib\/db\/client/.test(source)) {
      findings.push(createFinding({
        severity: 'P1',
        subsystem: 'architecture',
        title: 'Client component imports server-only or privileged code',
        file,
        risk: 'Client components must not bundle server-only modules or privileged DB/env access.',
        recommendation: 'Move privileged work behind an API/server component or convert the import to type-only if safe.',
      }))
    }

    const importSources = extractImportSources(source)
    if (file.startsWith('worker/') && importSources.some((importSource) => /^(next\/|@\/app\/|src\/app\/)/.test(importSource))) {
      findings.push(createFinding({
        severity: 'P1',
        subsystem: 'architecture',
        title: 'Worker imports app/Next runtime code',
        file,
        risk: 'Worker bundles should stay runtime-agnostic and not depend on Next.js app modules.',
        recommendation: 'Move shared contracts into packages/contracts or worker-safe modules.',
      }))
    }

    const hasBrowserProviderRuntimeCoupling =
      importSources.some((importSource) => /playwright|chromium|browserbase|steel|browserless/i.test(importSource)) ||
      /process\.env\.(BROWSERBASE|STEEL|BROWSERLESS|REMOTE_CDP|BROWSER_QA_GATEWAY_PROVIDER)/.test(source)
    if (/shared|processor|core/.test(file) && hasBrowserProviderRuntimeCoupling && !isBrowserOwnedBoundary(file)) {
      findings.push(createFinding({
        severity: 'P2',
        subsystem: 'architecture',
        title: 'Browser provider reference appears outside browser-owned seam',
        file,
        risk: 'Browser execution should stay isolated behind Browser Operator/gateway seams.',
        recommendation: 'Verify this is type/config-only or move provider-specific logic into the browser gateway/provider router.',
      }))
    }

    if (/TODO|FIXME|HACK|legacy|deprecated/i.test(source)) {
      items.push({
        file,
        kind: /legacy|deprecated/i.test(source) ? 'docs_stale_candidate' : 'cleanup_candidate' as CodeCleanupInventoryItem['kind'],
        subsystem,
        reason: 'Contains TODO/FIXME/HACK/legacy/deprecated markers that should be triaged during cleanup.',
        evidence: { markers: [...source.matchAll(/\b(TODO|FIXME|HACK|legacy|deprecated)\b/gi)].slice(0, 10).map((match) => match[0]) },
        recommendedAction: 'Review marker intent, delete stale comments, or convert real work into tracked backlog/tests.',
      })
    }

    const functionCount = (source.match(/\bfunction\b|=>/g) ?? []).length
    const lineCount = source.split('\n').length
    if (lineCount > 700 && functionCount > 20 && !file.includes('__tests__')) {
      items.push({
        file,
        kind: 'split_candidate',
        subsystem,
        reason: 'Large multi-function file may be harder to review and maintain.',
        evidence: { lineCount, functionCount },
        recommendedAction: 'Split only if ownership or testability improves; otherwise document why it remains cohesive.',
      })
    }

    if ((source.match(/process\.env\./g) ?? []).length >= 5) {
      items.push({
        file,
        kind: 'centralize_candidate',
        subsystem,
        reason: 'Repeated env reads can drift and should usually flow through a typed config/helper seam.',
        evidence: { envReads: (source.match(/process\.env\./g) ?? []).length },
        recommendedAction: 'Centralize env parsing and validation in a domain config helper.',
      })
    }
  }

  for (const [basename, group] of basenameGroups) {
    const productionFiles = group.filter((file) => !file.includes('__tests__') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts'))
    if (productionFiles.length >= 4 && basename.length > 3) {
      items.push({
        file: productionFiles[0],
        kind: 'dedupe_candidate',
        subsystem: classifySubsystem(productionFiles[0]),
        reason: `Many files share basename "${basename}", which may indicate duplicated concepts or intentionally mirrored adapters.`,
        evidence: { files: productionFiles.slice(0, 20), count: productionFiles.length },
        recommendedAction: 'Confirm whether these are true adapters/contracts or can share a central helper.',
      })
    }
  }

  return { items, findings }
}

function isBrowserOwnedBoundary(file: string): boolean {
  return (
    /browser-qa|browser-operator|browser-pool/.test(file) ||
    file.startsWith('packages/openclaw-core/')
  )
}

function extractImportSources(source: string): string[] {
  const imports = [
    ...source.matchAll(/\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bexport\s+(?:type\s+)?[^'"]+\s+from\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]
  return imports.map((match) => match[1]).filter(Boolean)
}

function classifySubsystem(file: string): string {
  if (file.startsWith('worker/')) return 'worker'
  if (file.includes('/browser-operator/') || file.includes('/browser-qa/')) return 'browser-operator'
  if (file.includes('/agent-commerce/')) return 'agent-commerce'
  if (file.includes('/knowledge/') || file.includes('/brain-')) return 'knowledge'
  if (file.includes('/templates/')) return 'templates'
  if (file.includes('/channels/') || file.includes('/discord/') || file.includes('/telegram/') || file.includes('/whatsapp/')) return 'channels'
  if (file.includes('/components/')) return 'ui'
  if (file.startsWith('packages/')) return 'packages'
  if (file.startsWith('scripts/')) return 'scripts'
  return 'app'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildArchitectureDriftInventory(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
