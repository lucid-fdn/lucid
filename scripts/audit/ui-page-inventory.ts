import type { AuditFinding, UiPageInventoryItem } from './audit-types'
import { createFinding, readText, walkFiles } from './audit-utils'

export async function buildUiPageInventory(root: string): Promise<{
  items: UiPageInventoryItem[]
  findings: AuditFinding[]
}> {
  const files = await walkFiles(root, {
    includeExtensions: ['page.tsx'],
    includeGlobs: [/^src\/app\/.*\/page\.tsx$/],
  })
  const items: UiPageInventoryItem[] = []
  const findings: AuditFinding[] = []

  for (const file of files) {
    const source = await readText(root, file).catch(() => '')
    const item = inspectPage(file, source)
    items.push(item)

    if (item.hasMockMarkers && item.classification !== 'public' && item.classification !== 'legacy') {
      findings.push(createFinding({
        severity: 'P2',
        subsystem: 'ui-page-audit',
        title: 'Authenticated product page contains mock/demo markers',
        file,
        risk: 'Users may see placeholder data or false product state if mock markers leak into product pages.',
        recommendation: 'Verify the marker is test-only or replace it with real API-backed empty/data state.',
        evidence: { routePath: item.routePath, classification: item.classification },
      }))
    }

    if (item.actionMarkers.length > 0 && !hasObviousActionWiring(source)) {
      findings.push(createFinding({
        severity: 'P3',
        subsystem: 'ui-page-audit',
        title: 'Page has action copy but no obvious action wiring',
        file,
        risk: 'Visible CTAs without wiring create dead-end UX.',
        recommendation: 'Verify all visible CTAs navigate or mutate intentionally.',
        evidence: { routePath: item.routePath, actionMarkers: item.actionMarkers },
      }))
    }
  }

  return { items, findings }
}

export function inspectPage(file: string, source: string): UiPageInventoryItem {
  const firstLines = source.split('\n').slice(0, 8).join('\n')
  const routePath = pagePathFromFile(file)
  const sourceForMockMarkers = source
    // Normal form placeholders are UX hints, not fake product data.
    .replace(/placeholder\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\})/g, '')
    .replace(/\bplaceholder\s*:\s*[^;\n]+/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const sourceForActionMarkers = stripNonVisibleSource(source)
  const actionMarkers = [...sourceForActionMarkers.matchAll(/\b(Install|Deploy|Save|Delete|Reconcile|Connect|Refresh|Approve|Reject|Run|Test|Create|Update|Submit)\b/g)]
    .slice(0, 30)
    .map((match) => match[1])
  const dataMarkers = [...source.matchAll(/\b(count|total|status|health|latency|run|source|fact|claim|agent|template|channel|provider)\b/gi)]
    .slice(0, 30)
    .map((match) => match[1].toLowerCase())

  return {
    file,
    routePath,
    classification: classifyPage(routePath, file),
    hasClientComponent: /['"]use client['"]/.test(firstLines),
    hasLoadingState: /loading|skeleton|spinner|pending/i.test(source),
    hasErrorState: /error|toast|Alert|notFound|try\s*\{/i.test(source),
    hasMockMarkers: /\b(mock[A-Z]\w*|mock|placeholder|demo data|fake|sample data|lorem ipsum)\b/i.test(sourceForMockMarkers),
    actionMarkers: [...new Set(actionMarkers)],
    dataMarkers: [...new Set(dataMarkers)],
    notes: [],
  }
}

function hasObviousActionWiring(source: string): boolean {
  return /onClick|form\b|action=|href=|Link\b|Button\b|redirect\(|router\.|useActionState|useFormStatus|<Suspense\b|<[A-Z][A-Za-z0-9_.]*(\s|>|\/)/.test(source)
}

function stripNonVisibleSource(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/export\s+const\s+metadata\s*=\s*\{[\s\S]*?\n\}/g, '')
    .replace(/metadata\s*:\s*\{[\s\S]*?\n\s*\}/g, '')
}

function classifyPage(routePath: string, file: string): UiPageInventoryItem['classification'] {
  if (routePath.includes('mission-control')) return 'mission_control'
  if (routePath.includes('templates')) return 'template'
  if (routePath.includes('knowledge')) return 'knowledge'
  if (routePath.includes('browser')) return 'browser_operator'
  if (routePath.includes('agent-ops')) return 'agent_ops'
  if (routePath.includes('commerce')) return 'commerce'
  if (routePath.includes('settings')) return 'settings'
  if (routePath.includes('admin')) return 'admin'
  if (file.includes('(app)') || routePath.includes('/:workspace-slug')) return 'authenticated'
  if (file.includes('(retail)') || file.includes('legacy')) return 'legacy'
  return 'public'
}

function pagePathFromFile(file: string): string {
  return file
    .replace(/^src\/app/, '')
    .replace(/\/page\.tsx$/, '')
    .split('/')
    .filter((segment) => !segment.startsWith('('))
    .map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) return `:${segment.slice(1, -1).replace('...', '')}`
      return segment
    })
    .join('/') || '/'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildUiPageInventory(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
