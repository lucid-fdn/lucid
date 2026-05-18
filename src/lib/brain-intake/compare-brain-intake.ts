import type { BrainIntakeDraftItem } from './schema'

function normalize(value: string): string {
  return value.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function fingerprint(item: BrainIntakeDraftItem): string {
  const url = item.url?.toLowerCase().replace(/\/+$/, '')
  if (url) return `url:${url}`
  return `${item.destination}:${normalize(item.title)}:${normalize(item.body).slice(0, 160)}`
}

function tokenSet(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((token) => token.length > 3))
}

function similarity(a: string, b: string): number {
  const left = tokenSet(a)
  const right = tokenSet(b)
  if (left.size === 0 || right.size === 0) return 0
  let overlap = 0
  for (const token of left) {
    if (right.has(token)) overlap += 1
  }
  return overlap / Math.max(left.size, right.size)
}

export function compareBrainIntakeItems(items: BrainIntakeDraftItem[]): BrainIntakeDraftItem[] {
  const seen = new Map<string, BrainIntakeDraftItem>()

  return items.map((item) => {
    const key = fingerprint(item)
    const exactDuplicate = seen.get(key)
    if (exactDuplicate) {
      return {
        ...item,
        duplicateOf: {
          kind: exactDuplicate.destination,
          id: exactDuplicate.id,
          title: exactDuplicate.title,
          confidence: 0.98,
        },
        recommendedAction: 'skip',
        selected: false,
        requiresReview: true,
        warnings: [...item.warnings, `Looks identical to "${exactDuplicate.title}".`],
      }
    }

    const similar = Array.from(seen.values()).find((candidate) => (
      candidate.destination === item.destination &&
      similarity(candidate.body, item.body) >= 0.82
    ))

    seen.set(key, item)

    if (!similar) return item

    return {
      ...item,
      duplicateOf: {
        kind: similar.destination,
        id: similar.id,
        title: similar.title,
        confidence: 0.84,
      },
      selected: false,
      recommendedAction: 'skip',
      requiresReview: true,
      warnings: [...item.warnings, `May overlap with "${similar.title}".`],
    }
  })
}
