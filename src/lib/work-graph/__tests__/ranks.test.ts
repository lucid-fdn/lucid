import { describe, expect, it } from 'vitest'

import { makeInitialRank, needsRankRebalance, numberToRank, rankBetween } from '../ranks'

describe('Work Graph ranks', () => {
  it('creates stable sortable initial ranks', () => {
    expect(makeInitialRank(0) < makeInitialRank(1)).toBe(true)
    expect(makeInitialRank(5)).toHaveLength(8)
  })

  it('creates a rank between two existing ranks', () => {
    const before = numberToRank(1000)
    const after = numberToRank(2000)
    const middle = rankBetween(before, after)

    expect(middle > before).toBe(true)
    expect(middle < after).toBe(true)
  })

  it('supports moving to top and bottom without resizing UI state', () => {
    const first = numberToRank(1000)
    const top = rankBetween(null, first)
    const bottom = rankBetween(first, null)

    expect(top < first).toBe(true)
    expect(bottom > first).toBe(true)
  })

  it('detects cramped ranks for async rebalance', () => {
    expect(needsRankRebalance([numberToRank(100), numberToRank(101)])).toBe(true)
    expect(needsRankRebalance([numberToRank(100), numberToRank(1000)])).toBe(false)
  })
})

