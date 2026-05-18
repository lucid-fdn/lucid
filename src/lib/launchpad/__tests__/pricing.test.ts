import { describe, it, expect } from 'vitest'
import { calculateRevenueSplit } from '../pricing'

describe('calculateRevenueSplit', () => {
  it('splits revenue correctly with default cost per token', () => {
    const result = calculateRevenueSplit(100, 1500, 100_000)

    expect(result.grossUsdc).toBe(100)
    expect(result.platformFeeUsdc).toBe(15) // 15%
    expect(result.inferenceCostUsdc).toBe(3) // 100k * 0.00003
    expect(result.stakerRewardUsdc).toBe(82) // 100 - 15 - 3
  })

  it('handles zero usage', () => {
    const result = calculateRevenueSplit(0, 1500, 0)

    expect(result.grossUsdc).toBe(0)
    expect(result.platformFeeUsdc).toBe(0)
    expect(result.inferenceCostUsdc).toBe(0)
    expect(result.stakerRewardUsdc).toBe(0)
  })

  it('caps staker reward at zero if costs exceed revenue', () => {
    const result = calculateRevenueSplit(1, 5000, 1_000_000)

    expect(result.stakerRewardUsdc).toBe(0)
  })

  it('uses custom cost per token', () => {
    const result = calculateRevenueSplit(100, 0, 100_000, 0.0001)

    expect(result.platformFeeUsdc).toBe(0)
    expect(result.inferenceCostUsdc).toBe(10)
    expect(result.stakerRewardUsdc).toBe(90)
  })

  it('handles high-precision USDC values', () => {
    const result = calculateRevenueSplit(0.000001, 1500, 1)

    expect(result.grossUsdc).toBe(0.000001)
    expect(result.platformFeeUsdc).toBeLessThanOrEqual(result.grossUsdc)
  })
})
