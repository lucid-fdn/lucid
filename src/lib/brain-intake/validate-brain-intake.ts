import type { BrainIntakeDraftItem } from './schema'

const PRIVATE_HOST_PATTERN = /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2\d|3[0-1])\.)|(^169\.254\.)/i

export function validateBrainIntakeItems(items: BrainIntakeDraftItem[]): BrainIntakeDraftItem[] {
  return items.map((item) => {
    const warnings = [...item.warnings]
    let requiresReview = item.requiresReview
    let recommendedAction = item.recommendedAction

    if (item.url) {
      try {
        const parsed = new URL(item.url)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          warnings.push('Only HTTP and HTTPS sources can be saved to Brain.')
          requiresReview = true
          recommendedAction = 'review'
        }
        if (PRIVATE_HOST_PATTERN.test(parsed.hostname)) {
          warnings.push('Private-network URLs require an explicit org policy before ingestion.')
          requiresReview = true
          recommendedAction = 'review'
        }
      } catch {
        warnings.push('Invalid source URL.')
        requiresReview = true
        recommendedAction = 'review'
      }
    }

    if (item.body.length > 20_000) {
      warnings.push('Large content will be capped before preview; use document ingestion for full indexing.')
      requiresReview = true
    }

    return {
      ...item,
      warnings: Array.from(new Set(warnings)),
      requiresReview,
      recommendedAction,
    }
  })
}
