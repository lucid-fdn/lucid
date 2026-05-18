const CANONICAL_TYPO_TARGETS = [
  { canonical: 'personal', maxDistance: 2, prefix: 'pers' },
  { canonical: 'assistant', maxDistance: 2, prefix: 'assi' },
  { canonical: 'calendar', maxDistance: 2, prefix: 'cale' },
  { canonical: 'email', maxDistance: 2, prefix: 'em' },
]

export function normalizeBuilderToken(token: string): string {
  const lower = stripDiacritics(token).toLowerCase()

  for (const target of CANONICAL_TYPO_TARGETS) {
    if (!isLikelyCanonicalNearMatch(lower, target.canonical, target.prefix, target.maxDistance)) continue
    if (levenshtein(lower, target.canonical) <= target.maxDistance) {
      return target.canonical
    }
  }

  return lower
}

export function normalizeBuilderText(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/(\s+)/)
    .map((part) => /\s+/.test(part) ? part : normalizeBuilderToken(part))
    .join('')
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0
  if (left.length === 0) return right.length
  if (right.length === 0) return left.length

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = new Array<number>(right.length + 1)

  for (let i = 0; i < left.length; i += 1) {
    current[0] = i + 1
    for (let j = 0; j < right.length; j += 1) {
      const cost = left[i] === right[j] ? 0 : 1
      current[j + 1] = Math.min(
        current[j]! + 1,
        previous[j + 1]! + 1,
        previous[j]! + cost,
      )
    }
    for (let j = 0; j < previous.length; j += 1) {
      previous[j] = current[j]!
    }
  }

  return previous[right.length]!
}

function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '')
}

function isLikelyCanonicalNearMatch(
  token: string,
  canonical: string,
  prefix: string,
  maxDistance: number,
): boolean {
  if (token === canonical) return true
  if (Math.abs(token.length - canonical.length) > maxDistance) return false
  if (token.startsWith(prefix)) return true
  if (token.slice(0, 4) === canonical.slice(0, 4)) return true
  if (token.slice(1, 5) === canonical.slice(1, 5)) return true
  if (token.includes(canonical.slice(1, 5))) return true
  if (token.endsWith(canonical.slice(-4))) return true
  return false
}
