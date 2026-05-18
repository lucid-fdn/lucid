import type {
  BrainIntakeDraftItem,
  BrainIntakeFreshness,
  BrainIntakePriority,
  BrainIntakeRecommendedAction,
  BrainIntakeScope,
  BrainIntakeTrustLevel,
} from './schema'

const HIGH_RISK_PATTERN = /\b(secret|password|api key|private key|token|credential|ssn|social security|credit card)\b/i
const POLICY_PATTERN = /\b(always|never|must|required|policy|compliance|legal|security|approval)\b/i
const STALE_PATTERN = /\b(deprecated|old|outdated|stale|no longer|previously)\b/i
const FRESH_PATTERN = /\b(today|latest|current|now|new|updated|202[5-9]|203\d)\b/i

export function rankBrainIntakeItems(items: BrainIntakeDraftItem[]): BrainIntakeDraftItem[] {
  return items.map((item) => {
    const priority = inferPriority(item)
    const trustLevel = inferTrustLevel(item)
    const freshness = inferFreshness(item)
    const recommendedAction = inferRecommendedAction(item, priority)
    const suggestedScope = inferScope(item)
    const warnings = [...item.warnings]

    if (HIGH_RISK_PATTERN.test(item.body)) {
      warnings.push('Potential sensitive credential or personal data detected. Review before saving.')
    }

    if (item.destination === 'knowledge_source' && !item.url) {
      warnings.push('This source has no URL. It will be stored as a manual source reference.')
    }

    return {
      ...item,
      priority,
      trustLevel,
      freshness,
      recommendedAction,
      suggestedScope,
      requiresReview: item.requiresReview || recommendedAction === 'review' || recommendedAction === 'replace',
      warnings: Array.from(new Set(warnings)),
      explanation: buildExplanation(item, {
        priority,
        trustLevel,
        freshness,
        recommendedAction,
      }),
    }
  })
}

function inferPriority(item: BrainIntakeDraftItem): BrainIntakePriority {
  if (HIGH_RISK_PATTERN.test(item.body)) return 'critical'
  if (item.destination === 'context' && POLICY_PATTERN.test(item.body)) return 'high'
  if (item.destination === 'knowledge_source' || item.destination === 'knowledge_document') return 'normal'
  if (item.destination === 'recall_test') return 'low'
  return item.confidence >= 0.85 ? 'normal' : 'low'
}

function inferTrustLevel(item: BrainIntakeDraftItem): BrainIntakeTrustLevel {
  if (item.destination === 'context' && POLICY_PATTERN.test(item.body)) return 'operator_approved'
  if (item.destination === 'knowledge_document' && item.fileName) return 'operator_approved'
  if (item.destination === 'knowledge_fact' && item.confidence >= 0.82) return 'operator_approved'
  return 'observed'
}

function inferFreshness(item: BrainIntakeDraftItem): BrainIntakeFreshness {
  if (STALE_PATTERN.test(item.body)) return 'stale'
  if (FRESH_PATTERN.test(item.body)) return 'fresh'
  if (item.destination === 'knowledge_source' && item.url) return 'unknown'
  return 'unknown'
}

function inferRecommendedAction(
  item: BrainIntakeDraftItem,
  priority: BrainIntakePriority,
): BrainIntakeRecommendedAction {
  if (item.destination === 'recall_test') return 'test_recall'
  if (item.duplicateOf) return 'skip'
  if (item.conflicts.length > 0) return 'review'
  if (priority === 'critical') return 'review'
  if (item.requiresReview || item.confidence < 0.7) return 'review'
  return 'store'
}

function inferScope(_item: BrainIntakeDraftItem): BrainIntakeScope {
  // Current self-serve Knowledge surface is workspace-scoped. Project/team/agent
  // routing can override this once the caller passes structured scope metadata.
  return 'workspace'
}

function buildExplanation(
  item: BrainIntakeDraftItem,
  meta: {
    priority: BrainIntakePriority
    trustLevel: BrainIntakeTrustLevel
    freshness: BrainIntakeFreshness
    recommendedAction: BrainIntakeRecommendedAction
  },
): string {
  const destination = item.destination.replace(/^knowledge_/, '').replace(/_/g, ' ')
  return `Classified as ${destination}; priority=${meta.priority}; trust=${meta.trustLevel}; freshness=${meta.freshness}; action=${meta.recommendedAction}.`
}
