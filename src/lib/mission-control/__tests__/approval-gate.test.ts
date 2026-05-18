import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  requiresApproval,
  isElevatedTool,
  estimateRiskLevel,
  isApprovalExpired,
  approvalTimeRemaining,
} from '../approval-gate'

describe('requiresApproval', () => {
  it('returns true for listed tools', () => {
    expect(requiresApproval('dex_swap', ['dex_swap', 'wallet_transfer'])).toBe(true)
  })

  it('returns false for unlisted tools', () => {
    expect(requiresApproval('get_price', ['dex_swap', 'wallet_transfer'])).toBe(false)
  })

  it('returns false for empty approval list', () => {
    expect(requiresApproval('dex_swap', [])).toBe(false)
  })
})

describe('isElevatedTool', () => {
  it('returns true for dex_swap', () => {
    expect(isElevatedTool('dex_swap')).toBe(true)
  })

  it('returns true for wallet_transfer', () => {
    expect(isElevatedTool('wallet_transfer')).toBe(true)
  })

  it('returns false for get_price', () => {
    expect(isElevatedTool('get_price')).toBe(false)
  })
})

describe('estimateRiskLevel', () => {
  it('returns critical for high-value swap (> $1000)', () => {
    expect(estimateRiskLevel('dex_swap', { amount: 5000 })).toBe('critical')
  })

  it('returns high for medium-value swap ($100-$1000)', () => {
    expect(estimateRiskLevel('dex_swap', { amount: 500 })).toBe('high')
  })

  it('returns medium for low-value swap (< $100)', () => {
    expect(estimateRiskLevel('dex_swap', { amount: 50 })).toBe('medium')
  })

  it('returns critical for high-leverage order (> 10x)', () => {
    expect(estimateRiskLevel('hl_place_order', { leverage: 25 })).toBe('critical')
  })

  it('returns high for medium leverage (3-10x)', () => {
    expect(estimateRiskLevel('hl_place_order', { leverage: 5 })).toBe('high')
  })

  it('returns medium for low leverage (< 3x)', () => {
    expect(estimateRiskLevel('hl_place_order', { leverage: 2 })).toBe('medium')
  })

  it('returns low for unknown tools', () => {
    expect(estimateRiskLevel('get_price', {})).toBe('low')
  })

  it('uses value field as fallback for amount', () => {
    expect(estimateRiskLevel('wallet_transfer', { value: 2000 })).toBe('critical')
  })
})

describe('isApprovalExpired', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for past date', () => {
    expect(isApprovalExpired('2020-01-01T00:00:00Z')).toBe(true)
  })

  it('returns false for future date', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isApprovalExpired(future)).toBe(false)
  })
})

describe('approvalTimeRemaining', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns correct seconds for future expiry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const expiresAt = '2026-01-01T00:05:00Z' // 300 seconds later
    expect(approvalTimeRemaining(expiresAt)).toBe(300)
  })

  it('returns 0 for past expiry', () => {
    expect(approvalTimeRemaining('2020-01-01T00:00:00Z')).toBe(0)
  })
})
