/**
 * Tests for automation rule evaluator — pure functions, no I/O.
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateRule,
  isInCooldown,
  isMaxTriggersReached,
  isInBackoff,
  isPortfolioRuleType,
  computePortfolioMetrics,
  evaluatePortfolioStopLoss,
  evaluatePortfolioTakeProfit,
  evaluateConcentrationGuard,
  evaluateExposureCap,
  evaluatePortfolioRule,
} from '../services/automation-evaluator.js'
import type { PolymarketPosition } from '../services/types.js'

describe('evaluateRule', () => {
  // ── stop_loss ──

  describe('stop_loss', () => {
    it('triggers when price equals threshold', () => {
      const result = evaluateRule('stop_loss', { threshold_price: 0.30 }, { currentPrice: 0.30 })
      expect(result.triggered).toBe(true)
      expect(result.thresholdValue).toBe(0.30)
    })

    it('triggers when price is below threshold', () => {
      const result = evaluateRule('stop_loss', { threshold_price: 0.30 }, { currentPrice: 0.25 })
      expect(result.triggered).toBe(true)
    })

    it('does not trigger when price is above threshold', () => {
      const result = evaluateRule('stop_loss', { threshold_price: 0.30 }, { currentPrice: 0.50 })
      expect(result.triggered).toBe(false)
    })
  })

  // ── take_profit ──

  describe('take_profit', () => {
    it('triggers when price equals threshold', () => {
      const result = evaluateRule('take_profit', { threshold_price: 0.85 }, { currentPrice: 0.85 })
      expect(result.triggered).toBe(true)
      expect(result.thresholdValue).toBe(0.85)
    })

    it('triggers when price is above threshold', () => {
      const result = evaluateRule('take_profit', { threshold_price: 0.85 }, { currentPrice: 0.90 })
      expect(result.triggered).toBe(true)
    })

    it('does not trigger when price is below threshold', () => {
      const result = evaluateRule('take_profit', { threshold_price: 0.85 }, { currentPrice: 0.60 })
      expect(result.triggered).toBe(false)
    })
  })

  // ── trailing_stop ──

  describe('trailing_stop', () => {
    it('triggers when price drops below HWM trail', () => {
      const result = evaluateRule(
        'trailing_stop',
        { trail_percent: 10 },
        { currentPrice: 0.63, highWaterMark: 0.75 },
      )
      // HWM=0.75, trail=10%, triggerPrice = 0.75 * 0.9 = 0.675
      // 0.63 <= 0.675 → triggered
      expect(result.triggered).toBe(true)
      expect(result.thresholdValue).toBeCloseTo(0.675)
    })

    it('does not trigger when price is above trail', () => {
      const result = evaluateRule(
        'trailing_stop',
        { trail_percent: 10 },
        { currentPrice: 0.70, highWaterMark: 0.75 },
      )
      expect(result.triggered).toBe(false)
    })

    it('updates HWM when price exceeds stored HWM', () => {
      const result = evaluateRule(
        'trailing_stop',
        { trail_percent: 10 },
        { currentPrice: 0.80, highWaterMark: 0.75 },
      )
      expect(result.triggered).toBe(false)
      expect(result.newHighWaterMark).toBe(0.80)
    })

    it('does not update HWM when price is at stored HWM', () => {
      const result = evaluateRule(
        'trailing_stop',
        { trail_percent: 10 },
        { currentPrice: 0.75, highWaterMark: 0.75 },
      )
      expect(result.newHighWaterMark).toBeUndefined()
    })

    it('initializes HWM from currentPrice when no stored HWM', () => {
      const result = evaluateRule(
        'trailing_stop',
        { trail_percent: 10 },
        { currentPrice: 0.50 },
      )
      // HWM = 0.50, trail trigger = 0.50 * 0.9 = 0.45
      // 0.50 > 0.45 → not triggered
      expect(result.triggered).toBe(false)
      expect(result.thresholdValue).toBeCloseTo(0.45)
    })

    it('triggers immediately if trail_percent is 0 (edge)', () => {
      const result = evaluateRule(
        'trailing_stop',
        { trail_percent: 0 },
        { currentPrice: 0.50, highWaterMark: 0.50 },
      )
      // triggerPrice = 0.50 * 1.0 = 0.50 → 0.50 <= 0.50 → triggered
      expect(result.triggered).toBe(true)
    })
  })

  // ── time_exit ──

  describe('time_exit', () => {
    it('triggers when current time is past trigger time', () => {
      const endDate = new Date('2026-04-01T00:00:00Z')
      const now = new Date('2026-03-31T12:00:00Z')
      const result = evaluateRule(
        'time_exit',
        { exit_hours_before_close: 24 },
        { currentPrice: 0.50, marketEndDate: endDate.toISOString(), now },
      )
      // trigger at endDate - 24h = 2026-03-31T00:00:00Z
      // now (12:00) > trigger (00:00) → triggered
      expect(result.triggered).toBe(true)
      expect(result.thresholdValue).toBe(24)
    })

    it('does not trigger when still before trigger time', () => {
      const endDate = new Date('2026-04-01T00:00:00Z')
      const now = new Date('2026-03-29T12:00:00Z')
      const result = evaluateRule(
        'time_exit',
        { exit_hours_before_close: 24 },
        { currentPrice: 0.50, marketEndDate: endDate.toISOString(), now },
      )
      expect(result.triggered).toBe(false)
    })

    it('does not trigger when no market end date', () => {
      const result = evaluateRule(
        'time_exit',
        { exit_hours_before_close: 24 },
        { currentPrice: 0.50, now: new Date() },
      )
      expect(result.triggered).toBe(false)
    })

    it('triggers exactly at trigger time', () => {
      const endDate = new Date('2026-04-01T00:00:00Z')
      const now = new Date('2026-03-31T00:00:00Z') // exactly 24h before
      const result = evaluateRule(
        'time_exit',
        { exit_hours_before_close: 24 },
        { currentPrice: 0.50, marketEndDate: endDate.toISOString(), now },
      )
      expect(result.triggered).toBe(true)
    })
  })

  // ── unknown type ──

  it('returns not triggered for unknown rule type', () => {
    const result = evaluateRule('unknown_type' as any, {} as any, { currentPrice: 0.50 })
    expect(result.triggered).toBe(false)
    expect(result.thresholdValue).toBeNull()
  })
})

describe('isInCooldown', () => {
  it('returns false when never triggered', () => {
    expect(isInCooldown(null, 300)).toBe(false)
  })

  it('returns true when within cooldown period', () => {
    const recentTrigger = new Date(Date.now() - 60_000).toISOString() // 60s ago
    expect(isInCooldown(recentTrigger, 300)).toBe(true) // 300s cooldown
  })

  it('returns false when cooldown has elapsed', () => {
    const oldTrigger = new Date(Date.now() - 600_000).toISOString() // 600s ago
    expect(isInCooldown(oldTrigger, 300)).toBe(false) // 300s cooldown
  })

  it('supports injectable now parameter', () => {
    const trigger = '2026-03-25T10:00:00Z'
    const now = new Date('2026-03-25T10:02:00Z') // 2 minutes later
    expect(isInCooldown(trigger, 300, now)).toBe(true) // 5 min cooldown, only 2 min passed
    const later = new Date('2026-03-25T10:06:00Z') // 6 minutes later
    expect(isInCooldown(trigger, 300, later)).toBe(false)
  })
})

describe('isMaxTriggersReached', () => {
  it('returns false when max_triggers is null (unlimited)', () => {
    expect(isMaxTriggersReached(100, null)).toBe(false)
  })

  it('returns false when under limit', () => {
    expect(isMaxTriggersReached(2, 5)).toBe(false)
  })

  it('returns true when at limit', () => {
    expect(isMaxTriggersReached(5, 5)).toBe(true)
  })

  it('returns true when over limit', () => {
    expect(isMaxTriggersReached(6, 5)).toBe(true)
  })
})

describe('isInBackoff', () => {
  it('returns false when zero consecutive failures', () => {
    expect(isInBackoff(0, new Date().toISOString(), 300)).toBe(false)
  })

  it('returns false when lastFailedAt is null', () => {
    expect(isInBackoff(3, null, 300)).toBe(false)
  })

  it('returns true when within backoff window (1 failure)', () => {
    // 1 failure → 2x multiplier → 600s backoff
    const failedAt = new Date(Date.now() - 300_000).toISOString() // 300s ago
    expect(isInBackoff(1, failedAt, 300)).toBe(true) // 300 < 600
  })

  it('returns false when backoff has elapsed (1 failure)', () => {
    // 1 failure → 2x multiplier → 600s backoff
    const failedAt = new Date(Date.now() - 700_000).toISOString() // 700s ago
    expect(isInBackoff(1, failedAt, 300)).toBe(false) // 700 > 600
  })

  it('applies exponential backoff for multiple failures', () => {
    const now = new Date('2026-03-25T12:00:00Z')
    const failedAt = '2026-03-25T11:50:00Z' // 10 min ago = 600s

    // 1 failure: 300 * 2^1 = 600s → 600 < 600 = false (barely elapsed)
    expect(isInBackoff(1, failedAt, 300, now)).toBe(false)

    // 2 failures: 300 * 2^2 = 1200s → 600 < 1200 = true
    expect(isInBackoff(2, failedAt, 300, now)).toBe(true)

    // 3 failures: 300 * 2^3 = 2400s → 600 < 2400 = true
    expect(isInBackoff(3, failedAt, 300, now)).toBe(true)
  })

  it('caps multiplier at 2^5 = 32', () => {
    const now = new Date('2026-03-25T12:00:00Z')
    // 300 * 32 = 9600s = 160 min
    const failedAt = '2026-03-25T09:00:00Z' // 3 hours ago = 10800s

    // 5 failures: 300 * 2^5 = 9600 → 10800 > 9600 = false
    expect(isInBackoff(5, failedAt, 300, now)).toBe(false)

    // 10 failures: still 300 * 2^5 = 9600 (capped) → 10800 > 9600 = false
    expect(isInBackoff(10, failedAt, 300, now)).toBe(false)
  })

  it('supports injectable now parameter', () => {
    const failedAt = '2026-03-25T10:00:00Z'
    const earlyNow = new Date('2026-03-25T10:05:00Z') // 5 min = 300s
    const lateNow = new Date('2026-03-25T10:15:00Z') // 15 min = 900s

    // 1 failure: 300 * 2 = 600s
    expect(isInBackoff(1, failedAt, 300, earlyNow)).toBe(true)  // 300 < 600
    expect(isInBackoff(1, failedAt, 300, lateNow)).toBe(false)  // 900 > 600
  })

  it('works with small cooldown values', () => {
    // 60s cooldown, 1 failure → 120s backoff
    const failedAt = new Date(Date.now() - 60_000).toISOString() // 60s ago
    expect(isInBackoff(1, failedAt, 60)).toBe(true) // 60 < 120
  })
})

// ============================================================================
// Phase 5C: Portfolio-Level Evaluation
// ============================================================================

function makePosition(overrides: Partial<PolymarketPosition> = {}): PolymarketPosition {
  return {
    conditionId: '0x1',
    tokenId: 't1',
    outcome: 'Yes',
    size: '100',
    avgPrice: 0.50,
    currentPrice: 0.50,
    pnlUsd: 0,
    pnlPercent: 0,
    ...overrides,
  }
}

describe('isPortfolioRuleType', () => {
  it('returns true for portfolio types', () => {
    expect(isPortfolioRuleType('portfolio_stop_loss')).toBe(true)
    expect(isPortfolioRuleType('portfolio_take_profit')).toBe(true)
    expect(isPortfolioRuleType('concentration_guard')).toBe(true)
    expect(isPortfolioRuleType('exposure_cap')).toBe(true)
  })

  it('returns false for position types', () => {
    expect(isPortfolioRuleType('stop_loss')).toBe(false)
    expect(isPortfolioRuleType('take_profit')).toBe(false)
    expect(isPortfolioRuleType('trailing_stop')).toBe(false)
    expect(isPortfolioRuleType('time_exit')).toBe(false)
  })

  it('returns false for unknown types', () => {
    expect(isPortfolioRuleType('unknown')).toBe(false)
  })
})

describe('computePortfolioMetrics', () => {
  it('computes metrics for single position', () => {
    const positions = [makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.60 })]
    const m = computePortfolioMetrics(positions)
    expect(m.totalExposureUsd).toBe(60) // 100 * 0.60
    expect(m.totalCostBasis).toBe(50)   // 100 * 0.50
    expect(m.totalPnlUsd).toBe(10)
    expect(m.totalPnlPercent).toBe(20)  // (10/50)*100
    expect(m.positionCount).toBe(1)
  })

  it('computes metrics for multiple positions', () => {
    const positions = [
      makePosition({ conditionId: '0x1', size: '100', avgPrice: 0.40, currentPrice: 0.50 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '200', avgPrice: 0.30, currentPrice: 0.25 }),
    ]
    const m = computePortfolioMetrics(positions)
    expect(m.totalExposureUsd).toBe(100) // 100*0.50 + 200*0.25
    expect(m.totalCostBasis).toBe(100)   // 100*0.40 + 200*0.30
    expect(m.totalPnlUsd).toBe(0)
    expect(m.totalPnlPercent).toBe(0)
    expect(m.positionCount).toBe(2)
  })

  it('returns zero metrics for empty positions', () => {
    const m = computePortfolioMetrics([])
    expect(m.totalExposureUsd).toBe(0)
    expect(m.totalPnlPercent).toBe(0)
    expect(m.positionCount).toBe(0)
  })
})

describe('evaluatePortfolioStopLoss', () => {
  it('triggers when PnL below threshold', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.35 }),
    ])
    // PnL = (35 - 50) / 50 * 100 = -30%
    const result = evaluatePortfolioStopLoss({ threshold_pnl_percent: -20 }, metrics)
    expect(result.triggered).toBe(true)
    expect(result.affectedPositions).toHaveLength(1)
    expect(result.affectedPositions[0].exitAction).toBe('sell_yes')
  })

  it('does not trigger when PnL above threshold', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.45 }),
    ])
    // PnL = (45 - 50) / 50 * 100 = -10%
    const result = evaluatePortfolioStopLoss({ threshold_pnl_percent: -20 }, metrics)
    expect(result.triggered).toBe(false)
    expect(result.affectedPositions).toHaveLength(0)
  })

  it('triggers at exact threshold', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.40 }),
    ])
    // PnL = (40 - 50) / 50 * 100 = -20%
    const result = evaluatePortfolioStopLoss({ threshold_pnl_percent: -20 }, metrics)
    expect(result.triggered).toBe(true)
  })

  it('exits all positions sorted by exposure descending', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ conditionId: '0x1', tokenId: 't1', size: '50', avgPrice: 0.50, currentPrice: 0.30 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '200', avgPrice: 0.50, currentPrice: 0.30 }),
    ])
    const result = evaluatePortfolioStopLoss({ threshold_pnl_percent: -20 }, metrics)
    expect(result.affectedPositions).toHaveLength(2)
    // 200 * 0.30 = 60 > 50 * 0.30 = 15 → larger first
    expect(result.affectedPositions[0].conditionId).toBe('0x2')
    expect(result.affectedPositions[1].conditionId).toBe('0x1')
  })

  it('resolves exit action from outcome', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ outcome: 'No', size: '100', avgPrice: 0.50, currentPrice: 0.30 }),
    ])
    const result = evaluatePortfolioStopLoss({ threshold_pnl_percent: -20 }, metrics)
    expect(result.affectedPositions[0].exitAction).toBe('sell_no')
  })
})

describe('evaluatePortfolioTakeProfit', () => {
  it('triggers when PnL above threshold', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.80 }),
    ])
    // PnL = (80 - 50) / 50 * 100 = 60%
    const result = evaluatePortfolioTakeProfit({ threshold_pnl_percent: 50 }, metrics)
    expect(result.triggered).toBe(true)
    expect(result.affectedPositions).toHaveLength(1)
  })

  it('does not trigger when PnL below threshold', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.60 }),
    ])
    // PnL = 20%
    const result = evaluatePortfolioTakeProfit({ threshold_pnl_percent: 50 }, metrics)
    expect(result.triggered).toBe(false)
  })
})

describe('evaluateConcentrationGuard', () => {
  it('triggers when position exceeds max concentration', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ conditionId: '0x1', size: '300', avgPrice: 0.50, currentPrice: 0.50 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '100', avgPrice: 0.50, currentPrice: 0.50 }),
    ])
    // 0x1 exposure = 150, total = 200, concentration = 75%
    const result = evaluateConcentrationGuard({ max_concentration_pct: 40 }, metrics)
    expect(result.triggered).toBe(true)
    expect(result.affectedPositions).toHaveLength(1)
    expect(result.affectedPositions[0].conditionId).toBe('0x1')
  })

  it('uses default target (max - 5)', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ conditionId: '0x1', size: '300', avgPrice: 0.50, currentPrice: 0.50 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '100', avgPrice: 0.50, currentPrice: 0.50 }),
    ])
    const result = evaluateConcentrationGuard({ max_concentration_pct: 40 }, metrics)
    // Target = 35%, current size=300, pct=75%, targetSize = (35/75)*300 = 140
    // exitAmount = 300 - 140 = 160
    expect(result.affectedPositions[0].exitAmount).toBeCloseTo(160)
  })

  it('uses custom target_concentration_pct', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ conditionId: '0x1', size: '300', avgPrice: 0.50, currentPrice: 0.50 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '100', avgPrice: 0.50, currentPrice: 0.50 }),
    ])
    const result = evaluateConcentrationGuard({ max_concentration_pct: 40, target_concentration_pct: 30 }, metrics)
    // Target = 30%, current size=300, pct=75%, targetSize = (30/75)*300 = 120
    // exitAmount = 300 - 120 = 180
    expect(result.affectedPositions[0].exitAmount).toBeCloseTo(180)
  })

  it('does not trigger when all positions within limit', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ conditionId: '0x1', size: '100', avgPrice: 0.50, currentPrice: 0.50 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '100', avgPrice: 0.50, currentPrice: 0.50 }),
    ])
    // Both 50% < 60%
    const result = evaluateConcentrationGuard({ max_concentration_pct: 60 }, metrics)
    expect(result.triggered).toBe(false)
  })

  it('does not trigger when total exposure is zero', () => {
    const metrics = computePortfolioMetrics([])
    const result = evaluateConcentrationGuard({ max_concentration_pct: 40 }, metrics)
    expect(result.triggered).toBe(false)
  })
})

describe('evaluateExposureCap', () => {
  it('triggers when total exposure exceeds cap', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.80, pnlPercent: 60 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '200', avgPrice: 0.50, currentPrice: 0.40, pnlPercent: -20 }),
    ])
    // Total exposure = 100*0.80 + 200*0.40 = 80 + 80 = 160
    const result = evaluateExposureCap({ max_exposure_usd: 100 }, metrics)
    expect(result.triggered).toBe(true)
    // Should exit worst PnL first (the -20% position)
    expect(result.affectedPositions[0].pnlPercent ?? result.affectedPositions[0].conditionId).toBeDefined()
  })

  it('uses default target (max * 0.9)', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '200', avgPrice: 0.50, currentPrice: 0.60, pnlPercent: 20 }),
    ])
    // Total exposure = 120, cap = 100, target = 90
    const result = evaluateExposureCap({ max_exposure_usd: 100 }, metrics)
    expect(result.triggered).toBe(true)
    // Full exit of the position since it's the only one and 120 > 90
    expect(result.affectedPositions).toHaveLength(1)
  })

  it('uses custom target_exposure_usd', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '200', avgPrice: 0.50, currentPrice: 0.60, pnlPercent: 20 }),
    ])
    const result = evaluateExposureCap({ max_exposure_usd: 100, target_exposure_usd: 80 }, metrics)
    expect(result.triggered).toBe(true)
  })

  it('does not trigger when under cap', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.50 }),
    ])
    // Total exposure = 50 < 100
    const result = evaluateExposureCap({ max_exposure_usd: 100 }, metrics)
    expect(result.triggered).toBe(false)
  })

  it('exits worst PnL first and stops when target reached', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ conditionId: '0x1', tokenId: 't1', size: '100', avgPrice: 0.50, currentPrice: 0.50, pnlPercent: 0 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '100', avgPrice: 0.50, currentPrice: 0.50, pnlPercent: -30 }),
      makePosition({ conditionId: '0x3', tokenId: 't3', size: '100', avgPrice: 0.50, currentPrice: 0.50, pnlPercent: 10 }),
    ])
    // Total exposure = 150, cap = 100, target = 90
    // Sorted by pnlPercent: -30, 0, 10
    // Exit 0x2 first: 150 - 50 = 100 (still > 90)
    // Exit 0x1 next: 100 - 50 = 50 (now ≤ 90, stop)
    const result = evaluateExposureCap({ max_exposure_usd: 100 }, metrics)
    expect(result.triggered).toBe(true)
    expect(result.affectedPositions).toHaveLength(2)
    expect(result.affectedPositions[0].conditionId).toBe('0x2')
    expect(result.affectedPositions[1].conditionId).toBe('0x1')
  })
})

describe('evaluatePortfolioRule (dispatcher)', () => {
  it('dispatches to portfolio_stop_loss', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.30 }),
    ])
    const result = evaluatePortfolioRule('portfolio_stop_loss', { threshold_pnl_percent: -20 }, metrics)
    expect(result.triggered).toBe(true)
  })

  it('dispatches to portfolio_take_profit', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '100', avgPrice: 0.50, currentPrice: 0.80 }),
    ])
    const result = evaluatePortfolioRule('portfolio_take_profit', { threshold_pnl_percent: 50 }, metrics)
    expect(result.triggered).toBe(true)
  })

  it('dispatches to concentration_guard', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '300', avgPrice: 0.50, currentPrice: 0.50 }),
      makePosition({ conditionId: '0x2', tokenId: 't2', size: '100', avgPrice: 0.50, currentPrice: 0.50 }),
    ])
    const result = evaluatePortfolioRule('concentration_guard', { max_concentration_pct: 40 }, metrics)
    expect(result.triggered).toBe(true)
  })

  it('dispatches to exposure_cap', () => {
    const metrics = computePortfolioMetrics([
      makePosition({ size: '200', avgPrice: 0.50, currentPrice: 0.60 }),
    ])
    const result = evaluatePortfolioRule('exposure_cap', { max_exposure_usd: 100 }, metrics)
    expect(result.triggered).toBe(true)
  })

  it('returns not triggered for unknown portfolio type', () => {
    const metrics = computePortfolioMetrics([])
    const result = evaluatePortfolioRule('unknown_type' as any, {}, metrics)
    expect(result.triggered).toBe(false)
  })
})
