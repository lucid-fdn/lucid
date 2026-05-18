import { describe, it, expect } from 'vitest'
import { detectLoops } from '../loop-detector'

describe('detectLoops', () => {
  it('returns not detected for no tool calls', () => {
    const result = detectLoops([])
    expect(result.detected).toBe(false)
    expect(result.loops).toEqual([])
    expect(result.reason).toBeNull()
  })

  it('returns not detected for unique calls', () => {
    const calls = [
      { tool_name: 'get_price', args_hash: 'a', called_at: '2026-01-01T00:00:00Z' },
      { tool_name: 'get_price', args_hash: 'b', called_at: '2026-01-01T00:00:01Z' },
      { tool_name: 'wallet_balance', args_hash: 'c', called_at: '2026-01-01T00:00:02Z' },
    ]
    const result = detectLoops(calls)
    expect(result.detected).toBe(false)
  })

  it('detects loop with 4+ same tool+args (threshold is 3)', () => {
    const calls = Array.from({ length: 4 }, (_, i) => ({
      tool_name: 'get_price',
      args_hash: 'same-hash',
      called_at: `2026-01-01T00:00:0${i}Z`,
    }))
    const result = detectLoops(calls)
    expect(result.detected).toBe(true)
    expect(result.loops).toHaveLength(1)
    expect(result.loops[0].tool_name).toBe('get_price')
    expect(result.loops[0].call_count).toBe(4)
    expect(result.reason).toContain('get_price')
    expect(result.reason).toContain('4 times')
  })

  it('does not detect loop at exactly threshold (3 calls)', () => {
    const calls = Array.from({ length: 3 }, (_, i) => ({
      tool_name: 'get_price',
      args_hash: 'same-hash',
      called_at: `2026-01-01T00:00:0${i}Z`,
    }))
    const result = detectLoops(calls)
    expect(result.detected).toBe(false)
  })

  it('reports multiple loops', () => {
    const calls = [
      ...Array.from({ length: 5 }, (_, i) => ({
        tool_name: 'get_price',
        args_hash: 'hash-a',
        called_at: `2026-01-01T00:00:0${i}Z`,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        tool_name: 'wallet_balance',
        args_hash: 'hash-b',
        called_at: `2026-01-01T00:01:0${i}Z`,
      })),
    ]
    const result = detectLoops(calls)
    expect(result.detected).toBe(true)
    expect(result.loops).toHaveLength(2)
    // Reason should reference the worst loop (get_price with 5 calls)
    expect(result.reason).toContain('get_price')
    expect(result.reason).toContain('5 times')
  })
})
