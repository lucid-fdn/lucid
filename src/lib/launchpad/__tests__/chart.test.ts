import { describe, it, expect } from 'vitest'

/**
 * Chart data utility tests.
 * Tests the price-points-to-candles conversion logic used in the chart route.
 * The actual route handler depends on DB + external APIs and is tested via integration tests.
 */

// We can't import the route directly (it uses Next.js runtime), so we
// replicate the pure conversion logic here to test it independently.

type TimeRange = '1H' | '4H' | '1D' | '1W' | '1M' | 'ALL'

const RANGE_CONFIG: Record<TimeRange, { intervalMs: number; count: number }> = {
  '1H': { intervalMs: 60_000, count: 60 },
  '4H': { intervalMs: 5 * 60_000, count: 48 },
  '1D': { intervalMs: 30 * 60_000, count: 48 },
  '1W': { intervalMs: 4 * 3600_000, count: 42 },
  '1M': { intervalMs: 24 * 3600_000, count: 30 },
  'ALL': { intervalMs: 24 * 3600_000, count: 90 },
}

interface JupiterPricePoint {
  unixTime: number
  value: number
}

function pricePointsToCandles(points: JupiterPricePoint[], range: TimeRange) {
  const config = RANGE_CONFIG[range]
  const bucketMs = config.intervalMs
  const buckets = new Map<number, number[]>()

  for (const pt of points) {
    const bucketKey = Math.floor((pt.unixTime * 1000) / bucketMs) * bucketMs
    const arr = buckets.get(bucketKey)
    if (arr) arr.push(pt.value)
    else buckets.set(bucketKey, [pt.value])
  }

  const candles = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, prices]) => {
      const open = prices[0]
      const close = prices[prices.length - 1]
      const high = Math.max(...prices)
      const low = Math.min(...prices)
      return {
        time: new Date(ts).toISOString(),
        open: Number(open.toFixed(6)),
        high: Number(high.toFixed(6)),
        low: Number(low.toFixed(6)),
        close: Number(close.toFixed(6)),
        volume: 0,
      }
    })

  return candles.length >= 2 ? candles : null
}

describe('pricePointsToCandles', () => {
  it('converts price points into OHLCV candles', () => {
    const now = Math.floor(Date.now() / 1000)
    const points: JupiterPricePoint[] = [
      { unixTime: now - 3600, value: 1.0 },
      { unixTime: now - 3540, value: 1.1 },
      { unixTime: now - 3480, value: 0.9 },
      { unixTime: now - 3000, value: 1.2 },
      { unixTime: now - 2940, value: 1.3 },
      { unixTime: now - 2400, value: 1.15 },
    ]

    const candles = pricePointsToCandles(points, '1H')
    expect(candles).not.toBeNull()
    expect(candles!.length).toBeGreaterThanOrEqual(2)

    for (const c of candles!) {
      expect(c.high).toBeGreaterThanOrEqual(c.low)
      expect(c.high).toBeGreaterThanOrEqual(c.open)
      expect(c.high).toBeGreaterThanOrEqual(c.close)
      expect(c.low).toBeLessThanOrEqual(c.open)
      expect(c.low).toBeLessThanOrEqual(c.close)
    }
  })

  it('returns null when insufficient data points', () => {
    const now = Math.floor(Date.now() / 1000)
    const points: JupiterPricePoint[] = [
      { unixTime: now - 60, value: 1.0 },
    ]
    const candles = pricePointsToCandles(points, '1H')
    expect(candles).toBeNull()
  })

  it('handles single-point candles correctly', () => {
    const now = Math.floor(Date.now() / 1000)
    // Two points in different 30-minute buckets for 1D range
    const points: JupiterPricePoint[] = [
      { unixTime: now - 7200, value: 5.0 },
      { unixTime: now - 3600, value: 6.0 },
    ]
    const candles = pricePointsToCandles(points, '1D')
    expect(candles).not.toBeNull()
    expect(candles!.length).toBe(2)
    // Single-point candle: open === close === high === low
    expect(candles![0].open).toBe(candles![0].close)
  })

  it('sorts candles chronologically', () => {
    const now = Math.floor(Date.now() / 1000)
    // Insert points out of order
    const points: JupiterPricePoint[] = [
      { unixTime: now - 1800, value: 3.0 },
      { unixTime: now - 7200, value: 1.0 },
      { unixTime: now - 3600, value: 2.0 },
    ]
    const candles = pricePointsToCandles(points, '1D')
    expect(candles).not.toBeNull()
    for (let i = 1; i < candles!.length; i++) {
      expect(new Date(candles![i].time).getTime()).toBeGreaterThan(
        new Date(candles![i - 1].time).getTime()
      )
    }
  })
})
