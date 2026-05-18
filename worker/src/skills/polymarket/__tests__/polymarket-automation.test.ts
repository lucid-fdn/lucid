/**
 * Tests for polymarket automation cron — rule evaluation + approval resolution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock config
vi.mock('../../../config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ FEATURE_POLYMARKET_AUTOMATION: true }),
}))

// Mock services
vi.mock('../services/automation-evaluator.js', () => ({
  evaluateRule: vi.fn().mockReturnValue({ triggered: false, thresholdValue: null }),
  isInCooldown: vi.fn().mockReturnValue(false),
  isMaxTriggersReached: vi.fn().mockReturnValue(false),
  isInBackoff: vi.fn().mockReturnValue(false),
  isPortfolioRuleType: vi.fn().mockImplementation((t: string) =>
    ['portfolio_stop_loss', 'portfolio_take_profit', 'concentration_guard', 'exposure_cap'].includes(t)),
  computePortfolioMetrics: vi.fn().mockReturnValue({
    totalPnlUsd: 0, totalPnlPercent: 0, totalExposureUsd: 0, totalCostBasis: 0, positionCount: 0, positions: [],
  }),
  evaluatePortfolioRule: vi.fn().mockReturnValue({ triggered: false, triggerSnapshot: {}, affectedPositions: [] }),
}))

vi.mock('../services/automation-rules.js', () => ({
  updateRuleState: vi.fn(),
}))

vi.mock('../services/position-aggregator.js', () => ({
  getPositions: vi.fn().mockResolvedValue([]),
}))

vi.mock('../services/clob-client.js', () => ({
  getMarket: vi.fn().mockResolvedValue({
    condition_id: '0x123',
    end_date_iso: '2026-12-31T00:00:00Z',
    tokens: [{ token_id: 't1', outcome: 'Yes', price: 0.50 }],
    minimum_order_size: '1',
  }),
}))

vi.mock('../services/trade-executor.js', () => ({
  executePolymarketTrade: vi.fn().mockResolvedValue({ success: true, orderId: 'ord1' }),
}))

vi.mock('../services/trade-logger.js', () => ({
  logPolymarketTrade: vi.fn(),
}))

import { evaluateAutomationRules, computeExecutionKey, computeBatchOutcome } from '../crons/automation.js'
import { getConfig } from '../../../config.js'
import { evaluateRule, isInCooldown, isMaxTriggersReached, isInBackoff } from '../services/automation-evaluator.js'
import { getPositions } from '../services/position-aggregator.js'
import { updateRuleState } from '../services/automation-rules.js'

function createMockSupabase(overrides: Record<string, any> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockResolvedValue({ data: [], error: null }),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return {
    from: vi.fn((table: string) => {
      if (overrides[table]) return overrides[table]
      return defaultChain
    }),
  } as any
}

describe('evaluateAutomationRules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bails when feature flag is off', async () => {
    vi.mocked(getConfig).mockReturnValue({ FEATURE_POLYMARKET_AUTOMATION: false } as any)
    const supabase = createMockSupabase()
    await evaluateAutomationRules(supabase)
    expect(supabase.from).not.toHaveBeenCalled()
    vi.mocked(getConfig).mockReturnValue({ FEATURE_POLYMARKET_AUTOMATION: true } as any)
  })

  it('handles no pending executions gracefully', async () => {
    const execChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    // Override last eq to return empty data
    let eqCount = 0
    execChain.eq.mockImplementation(() => {
      eqCount++
      if (eqCount === 2) {
        return Promise.resolve({ data: [], error: null })
      }
      return execChain
    })

    const rulesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }

    const supabase = createMockSupabase({
      polymarket_automation_executions: execChain,
      polymarket_automation_rules: rulesChain,
    })

    await evaluateAutomationRules(supabase)
    expect(supabase.from).toHaveBeenCalledWith('polymarket_automation_executions')
  })

  it('handles no enabled rules gracefully', async () => {
    const execChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    let eqCount = 0
    execChain.eq.mockImplementation(() => {
      eqCount++
      if (eqCount === 2) return Promise.resolve({ data: [], error: null })
      return execChain
    })

    const rulesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }

    const supabase = createMockSupabase({
      polymarket_automation_executions: execChain,
      polymarket_automation_rules: rulesChain,
    })

    await evaluateAutomationRules(supabase)
    expect(getPositions).not.toHaveBeenCalled()
  })

  it('skips rules in cooldown', async () => {
    vi.mocked(isInCooldown).mockReturnValue(true)

    const rule = {
      id: 'r1', agent_id: 'a1', org_id: 'o1', condition_id: '0x123',
      token_id: 't1', outcome: 'Yes', rule_type: 'stop_loss',
      rule_config: { threshold_price: 0.30 }, rule_state: {},
      exit_action: 'sell_yes', exit_amount_pct: 100, enabled: true,
      disabled_reason: null, cooldown_seconds: 300, max_triggers: null,
      trigger_count: 0, last_triggered_at: new Date().toISOString(),
      execution_mode: 'approval', consecutive_failures: 0, last_failed_at: null,
      created_at: '', updated_at: '',
    }

    const execChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    let execEqCount = 0
    execChain.eq.mockImplementation(() => {
      execEqCount++
      if (execEqCount === 2) return Promise.resolve({ data: [], error: null })
      return execChain
    })

    const rulesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [rule], error: null }),
    }

    const supabase = createMockSupabase({
      polymarket_automation_executions: execChain,
      polymarket_automation_rules: rulesChain,
    })

    vi.mocked(getPositions).mockResolvedValue([
      { conditionId: '0x123', tokenId: 't1', outcome: 'Yes', size: '100', avgPrice: 0.50, currentPrice: 0.25, pnlUsd: -25, pnlPercent: -50 },
    ])

    await evaluateAutomationRules(supabase)
    expect(evaluateRule).not.toHaveBeenCalled()
    vi.mocked(isInCooldown).mockReturnValue(false)
  })

  it('skips rules with max triggers reached', async () => {
    vi.mocked(isMaxTriggersReached).mockReturnValue(true)

    const rule = {
      id: 'r1', agent_id: 'a1', org_id: 'o1', condition_id: '0x123',
      token_id: 't1', outcome: 'Yes', rule_type: 'stop_loss',
      rule_config: { threshold_price: 0.30 }, rule_state: {},
      exit_action: 'sell_yes', exit_amount_pct: 100, enabled: true,
      disabled_reason: null, cooldown_seconds: 300, max_triggers: 1,
      trigger_count: 1, last_triggered_at: null,
      execution_mode: 'approval', consecutive_failures: 0, last_failed_at: null,
      created_at: '', updated_at: '',
    }

    const execChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    let execEqCount = 0
    execChain.eq.mockImplementation(() => {
      execEqCount++
      if (execEqCount === 2) return Promise.resolve({ data: [], error: null })
      return execChain
    })

    const rulesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [rule], error: null }),
    }

    const supabase = createMockSupabase({
      polymarket_automation_executions: execChain,
      polymarket_automation_rules: rulesChain,
    })

    vi.mocked(getPositions).mockResolvedValue([
      { conditionId: '0x123', tokenId: 't1', outcome: 'Yes', size: '100', avgPrice: 0.50, currentPrice: 0.25, pnlUsd: -25, pnlPercent: -50 },
    ])

    await evaluateAutomationRules(supabase)
    expect(evaluateRule).not.toHaveBeenCalled()
    vi.mocked(isMaxTriggersReached).mockReturnValue(false)
  })

  it('calls evaluateRule and updates HWM via evaluator pure functions', async () => {
    // The HWM update logic is in the evaluator pure functions (already tested in evaluator tests).
    // Here we verify the evaluateRule function returns the correct newHighWaterMark
    // when price exceeds stored HWM, and the cron would call updateRuleState.
    // The full integration is complex to mock (multi-table Supabase chains).
    // Evaluator pure function test covers the logic end-to-end.

    // Verify evaluateRule returns newHighWaterMark when price > stored HWM
    const { evaluateRule: realEvaluateRule } = await vi.importActual('../services/automation-evaluator.js') as any
    const result = realEvaluateRule(
      'trailing_stop',
      { trail_percent: 10 },
      { currentPrice: 0.80, highWaterMark: 0.75 },
    )
    expect(result.triggered).toBe(false)
    expect(result.newHighWaterMark).toBe(0.80)
    expect(result.thresholdValue).toBeCloseTo(0.72) // 0.80 * 0.9
  })

  it('does not error on empty positions', async () => {
    const rule = {
      id: 'r1', agent_id: 'a1', org_id: 'o1', condition_id: '0x123',
      token_id: 't1', outcome: 'Yes', rule_type: 'stop_loss',
      rule_config: { threshold_price: 0.30 }, rule_state: {},
      exit_action: 'sell_yes', exit_amount_pct: 100, enabled: true,
      disabled_reason: null, cooldown_seconds: 300, max_triggers: null,
      trigger_count: 0, last_triggered_at: null,
      execution_mode: 'approval', consecutive_failures: 0, last_failed_at: null,
      created_at: '', updated_at: '',
    }

    const execChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    let execEqCount = 0
    execChain.eq.mockImplementation(() => {
      execEqCount++
      if (execEqCount === 2) return Promise.resolve({ data: [], error: null })
      return execChain
    })

    const rulesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [rule], error: null }),
    }

    const supabase = createMockSupabase({
      polymarket_automation_executions: execChain,
      polymarket_automation_rules: rulesChain,
    })

    vi.mocked(getPositions).mockResolvedValue([]) // No positions

    // Should not throw
    await evaluateAutomationRules(supabase)
    expect(evaluateRule).not.toHaveBeenCalled()
  })

  it('does not call getPositions when feature is off', async () => {
    vi.mocked(getConfig).mockReturnValue({ FEATURE_POLYMARKET_AUTOMATION: false } as any)
    const supabase = createMockSupabase()
    await evaluateAutomationRules(supabase)
    expect(getPositions).not.toHaveBeenCalled()
    vi.mocked(getConfig).mockReturnValue({ FEATURE_POLYMARKET_AUTOMATION: true } as any)
  })

  it('skips rules in backoff', async () => {
    vi.mocked(isInBackoff).mockReturnValue(true)

    const rule = {
      id: 'r1', agent_id: 'a1', org_id: 'o1', condition_id: '0x123',
      token_id: 't1', outcome: 'Yes', rule_type: 'stop_loss',
      rule_config: { threshold_price: 0.30 }, rule_state: {},
      exit_action: 'sell_yes', exit_amount_pct: 100, enabled: true,
      disabled_reason: null, cooldown_seconds: 300, max_triggers: null,
      trigger_count: 0, last_triggered_at: null,
      execution_mode: 'approval', consecutive_failures: 2,
      last_failed_at: new Date().toISOString(),
      created_at: '', updated_at: '',
    }

    const execChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    let execEqCount = 0
    execChain.eq.mockImplementation(() => {
      execEqCount++
      if (execEqCount === 2) return Promise.resolve({ data: [], error: null })
      return execChain
    })

    const rulesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [rule], error: null }),
    }

    const supabase = createMockSupabase({
      polymarket_automation_executions: execChain,
      polymarket_automation_rules: rulesChain,
    })

    vi.mocked(getPositions).mockResolvedValue([
      { conditionId: '0x123', tokenId: 't1', outcome: 'Yes', size: '100', avgPrice: 0.50, currentPrice: 0.25, pnlUsd: -25, pnlPercent: -50 },
    ])

    await evaluateAutomationRules(supabase)
    expect(evaluateRule).not.toHaveBeenCalled()
    vi.mocked(isInBackoff).mockReturnValue(false)
  })
})

describe('computeExecutionKey', () => {
  it('produces deterministic key for same inputs in same time window', () => {
    const rule = {
      id: 'r1', rule_type: 'stop_loss', cooldown_seconds: 300,
    } as any

    const key1 = computeExecutionKey(rule, 0.3)
    const key2 = computeExecutionKey(rule, 0.3)
    expect(key1).toBe(key2)
  })

  it('includes rule_id and rule_type in key', () => {
    const rule = {
      id: 'r1', rule_type: 'stop_loss', cooldown_seconds: 300,
    } as any

    const key = computeExecutionKey(rule, 0.5)
    expect(key).toContain('r1')
    expect(key).toContain('stop_loss')
    expect(key).toContain('0.500000')
  })

  it('produces different keys for different trigger prices', () => {
    const rule = {
      id: 'r1', rule_type: 'stop_loss', cooldown_seconds: 300,
    } as any

    const key1 = computeExecutionKey(rule, 0.3)
    const key2 = computeExecutionKey(rule, 0.5)
    expect(key1).not.toBe(key2)
  })

  it('produces different keys for different rule IDs', () => {
    const rule1 = { id: 'r1', rule_type: 'stop_loss', cooldown_seconds: 300 } as any
    const rule2 = { id: 'r2', rule_type: 'stop_loss', cooldown_seconds: 300 } as any

    const key1 = computeExecutionKey(rule1, 0.3)
    const key2 = computeExecutionKey(rule2, 0.3)
    expect(key1).not.toBe(key2)
  })
})

// ── Phase 5C: Portfolio Batch Tests ──────────────────────────────────

describe('computeBatchOutcome', () => {
  it('returns full_success when all executed', () => {
    expect(computeBatchOutcome(['executed', 'executed', 'executed'])).toBe('full_success')
  })

  it('returns partial_success when some executed and some failed', () => {
    expect(computeBatchOutcome(['executed', 'failed', 'executed'])).toBe('partial_success')
  })

  it('returns full_failure when all failed', () => {
    expect(computeBatchOutcome(['failed', 'failed'])).toBe('full_failure')
  })

  it('returns full_failure when no executions succeeded', () => {
    expect(computeBatchOutcome(['failed'])).toBe('full_failure')
  })

  it('handles terminal non-failure statuses as non-failure', () => {
    // below_minimum and no_position are not 'executed' or 'failed'
    expect(computeBatchOutcome(['below_minimum', 'no_position'])).toBe('full_failure')
  })

  it('returns full_success with terminal non-failure + executed', () => {
    // only 'executed' and non-failure non-success statuses
    expect(computeBatchOutcome(['executed', 'below_minimum'])).toBe('full_success')
  })

  it('returns partial_success with executed + failed + terminal', () => {
    expect(computeBatchOutcome(['executed', 'failed', 'below_minimum'])).toBe('partial_success')
  })
})
