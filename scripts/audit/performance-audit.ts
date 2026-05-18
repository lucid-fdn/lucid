import type { AuditFinding, CodeCleanupInventoryItem } from './audit-types'
import { createFinding, readText, walkFiles } from './audit-utils'

export async function buildPerformanceAudit(root: string): Promise<{
  items: CodeCleanupInventoryItem[]
  findings: AuditFinding[]
}> {
  const files = await walkFiles(root, {
    includeExtensions: ['.ts', '.tsx', '.mts', '.js', '.jsx'],
    includeGlobs: [/^(src|worker|packages|scripts)\//],
  })
  const items: CodeCleanupInventoryItem[] = []
  const findings: AuditFinding[] = []

  for (const file of files) {
    const source = await readText(root, file).catch(() => '')
    const subsystem = file.startsWith('worker/') ? 'worker-performance' : 'app-performance'

    if (/\.select\(\s*['"`]\*['"`]\s*\)/.test(source)) {
      const severity: AuditFinding['severity'] = isHotPathPerformanceFile(file) ? 'P2' : 'P3'
      findings.push(createFinding({
        severity,
        subsystem,
        title: 'Wildcard DB select found',
        file,
        risk: severity === 'P2'
          ? 'Wildcard selects on hot request/worker paths can over-fetch columns, increase latency, and accidentally expose data when schemas grow.'
          : 'Wildcard selects in shared helpers are cleanup candidates. They may be intentional full-row loaders, but callers should confirm they need every column.',
        recommendation: severity === 'P2'
          ? 'Select explicit columns on production paths, especially API routes and worker processors.'
          : 'Prefer named projection constants when a helper is called from hot paths, or document the full-row contract.',
      }))
    }

    if (/Promise\.all\(/.test(source) && !/pLimit|limitConcurrency|concurrency|batch/i.test(source) && (source.match(/Promise\.all\(/g) ?? []).length >= 2) {
      items.push({
        file,
        kind: 'performance_candidate',
        subsystem,
        reason: 'Multiple Promise.all callsites without obvious concurrency bounds.',
        evidence: { promiseAllCount: (source.match(/Promise\.all\(/g) ?? []).length },
        recommendedAction: 'Verify inputs are bounded; add concurrency caps for user/provider/DB fanout.',
      })
    }

    if (/setInterval\(|setTimeout\(/.test(source) && !/clearInterval|clearTimeout|AbortSignal|timeout/i.test(source)) {
      items.push({
        file,
        kind: 'performance_candidate',
        subsystem,
        reason: 'Timer usage lacks obvious cleanup or timeout guard.',
        evidence: { timerCount: (source.match(/setInterval\(|setTimeout\(/g) ?? []).length },
        recommendedAction: 'Verify cleanup on unmount/shutdown and avoid unbounded polling.',
      })
    }

    if (/fetch\(/.test(source) && !/AbortSignal\.timeout|timeoutMs|withTimeout|signal:/.test(source)) {
      items.push({
        file,
        kind: 'performance_candidate',
        subsystem,
        reason: 'Network fetch without obvious timeout.',
        evidence: { fetchCount: (source.match(/fetch\(/g) ?? []).length },
        recommendedAction: 'Add AbortSignal.timeout or a shared fetch wrapper on server/worker paths.',
      })
    }
  }

  return { items, findings }
}

function isHotPathPerformanceFile(file: string): boolean {
  return (
    file.startsWith('src/app/api/') ||
    file.startsWith('src/app/(workflow)/') ||
    file.startsWith('worker/src/')
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildPerformanceAudit(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
