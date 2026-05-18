import type { BrainIntakeClassifyResponse, BrainIntakeDraftItem } from './schema'

function layerForDestination(destination: BrainIntakeDraftItem['destination']): string | null {
  if (destination === 'context') return 'Operating context'
  if (destination === 'knowledge_fact') return 'Facts'
  if (destination === 'knowledge_document') return 'Documents'
  if (destination === 'knowledge_source') return 'Sources'
  if (destination === 'recall_test') return 'Recall test'
  return null
}

export function buildBrainIntakePreview(items: BrainIntakeDraftItem[]): Pick<BrainIntakeClassifyResponse, 'quality' | 'preview' | 'summary'> {
  const selected = items.filter((item) => item.selected)
  const confidence = selected.length
    ? selected.reduce((sum, item) => sum + item.confidence, 0) / selected.length
    : 0
  const needsReviewCount = items.filter((item) => item.requiresReview || item.recommendedAction === 'review').length
  const duplicateCount = items.filter((item) => item.duplicateOf).length
  const conflictCount = items.reduce((sum, item) => sum + item.conflicts.length, 0)
  const affectedLayers = Array.from(new Set(items.map((item) => layerForDestination(item.destination)).filter(Boolean))) as string[]
  const warnings = Array.from(new Set(items.flatMap((item) => item.warnings)))

  return {
    summary: summarizeItems(items),
    quality: {
      confidence: Number(confidence.toFixed(4)),
      needsReviewCount,
      duplicateCount,
      conflictCount,
    },
    preview: {
      affectedLayers,
      estimatedRecallImpact: estimateRecallImpact(items),
      warnings,
    },
  }
}

function estimateRecallImpact(items: BrainIntakeDraftItem[]): 'none' | 'low' | 'medium' | 'high' {
  const commitItems = items.filter((item) => (
    item.selected &&
    item.recommendedAction !== 'skip' &&
    item.destination !== 'recall_test'
  ))
  if (commitItems.length === 0) return 'none'
  if (commitItems.some((item) => item.destination === 'knowledge_document' || item.destination === 'context')) return 'high'
  if (commitItems.length >= 2) return 'medium'
  return 'low'
}

function summarizeItems(items: BrainIntakeDraftItem[]): string {
  if (items.length === 0) return 'Nothing to store yet.'
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.destination] = (acc[item.destination] ?? 0) + 1
    return acc
  }, {})
  return [
    counts.context ? `${counts.context} context` : null,
    counts.knowledge_fact ? `${counts.knowledge_fact} fact` : null,
    counts.knowledge_document ? `${counts.knowledge_document} document` : null,
    counts.knowledge_source ? `${counts.knowledge_source} source` : null,
    counts.recall_test ? `${counts.recall_test} recall test` : null,
  ].filter(Boolean).join(', ')
}
