const BASE = 36
const WIDTH = 8
const MIN_RANK = 0
const MAX_RANK = BASE ** WIDTH - 1

function rankToNumber(rank: string | null | undefined, fallback: number): number {
  if (!rank) return fallback
  const parsed = Number.parseInt(rank, BASE)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, MIN_RANK), MAX_RANK) : fallback
}

export function numberToRank(value: number): string {
  const bounded = Math.min(Math.max(Math.floor(value), MIN_RANK), MAX_RANK)
  return bounded.toString(BASE).padStart(WIDTH, '0')
}

export function makeInitialRank(index = 0): string {
  return numberToRank(1000 + Math.max(0, index) * 1000)
}

export function rankBetween(beforeRank?: string | null, afterRank?: string | null): string {
  const before = rankToNumber(beforeRank, MIN_RANK)
  const after = rankToNumber(afterRank, MAX_RANK)

  if (after - before > 1) {
    return numberToRank(before + Math.floor((after - before) / 2))
  }

  if (!afterRank) {
    return numberToRank(Math.min(before + 1000, MAX_RANK))
  }

  if (!beforeRank) {
    return numberToRank(Math.max(after - 1000, MIN_RANK))
  }

  return numberToRank(before + 1)
}

export function needsRankRebalance(ranks: string[]): boolean {
  if (ranks.length < 2) return false

  const numeric = ranks
    .map((rank) => rankToNumber(rank, MIN_RANK))
    .sort((a, b) => a - b)

  for (let index = 1; index < numeric.length; index += 1) {
    if (numeric[index] - numeric[index - 1] <= 1) return true
  }
  return false
}

