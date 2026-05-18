import type { AuditFinding, UiUxAuditItem } from './audit-types'
import { createFinding } from './audit-utils'
import { buildUiPageInventory } from './ui-page-inventory'

const ACTION_LABELS = new Set([
  'Install',
  'Deploy',
  'Save',
  'Delete',
  'Reconcile',
  'Connect',
  'Refresh',
  'Approve',
  'Reject',
  'Run',
  'Test',
  'Create',
  'Update',
  'Submit',
])

export async function buildUiUxAudit(root: string): Promise<{
  items: UiUxAuditItem[]
  findings: AuditFinding[]
}> {
  const pageInventory = await buildUiPageInventory(root)
  const items: UiUxAuditItem[] = []
  const findings: AuditFinding[] = [...pageInventory.findings]

  for (const page of pageInventory.items) {
    const actionLabels = [...new Set(page.actionMarkers.filter((label) => ACTION_LABELS.has(label)))]
    const item: UiUxAuditItem = {
      file: page.file,
      routePath: page.routePath,
      classification: page.classification,
      visibleActionCount: actionLabels.length,
      actionLabels,
      hasMockMarkers: page.hasMockMarkers,
      hasLoadingState: page.hasLoadingState,
      hasErrorState: page.hasErrorState,
      hasEmptyStateSignal: page.notes.some((note) => /empty/i.test(note)) || page.dataMarkers.includes('status'),
      hasDisabledExplanationSignal: /settings|mission_control|browser_operator|template|knowledge|commerce|agent_ops/.test(page.classification),
      notes: [...page.notes],
    }
    items.push(item)

    if (isProductSurface(item) && !item.hasLoadingState) {
      findings.push(createFinding({
        severity: 'P3',
        subsystem: 'ui-ux',
        title: 'Product page lacks obvious loading-state signal',
        file: item.file,
        risk: 'Slow networks and SSR/client hydration can feel broken without visible loading feedback.',
        recommendation: 'Add a loading/skeleton/pending state or document why the page is static.',
        evidence: { routePath: item.routePath, classification: item.classification },
      }))
    }

    if (isProductSurface(item) && !item.hasErrorState) {
      findings.push(createFinding({
        severity: 'P3',
        subsystem: 'ui-ux',
        title: 'Product page lacks obvious error-state signal',
        file: item.file,
        risk: 'Users need recovery paths when API, auth, or provider calls fail.',
        recommendation: 'Add an error boundary, toast, or explicit failed-state recovery path.',
        evidence: { routePath: item.routePath, classification: item.classification },
      }))
    }
  }

  return { items, findings }
}

function isProductSurface(item: UiUxAuditItem): boolean {
  return !['public', 'legacy'].includes(item.classification)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildUiUxAudit(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
