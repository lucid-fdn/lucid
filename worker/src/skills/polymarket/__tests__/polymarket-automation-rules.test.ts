/**
 * Tests for automation rules CRUD service — validates rule config + Supabase calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateRuleConfig, createRule, listRules, updateRule, deleteRule, listExecutions } from '../services/automation-rules.js'

// Mock Supabase client
function createMockSupabase(responseData: any = null, responseError: any = null) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: responseData, error: responseError }),
  }
  // For list operations, resolve from the last chainable call
  chainable.order.mockReturnValue({
    ...chainable,
    then: (resolve: any) => resolve({ data: responseData ? [responseData] : [], error: responseError }),
    limit: vi.fn().mockResolvedValue({ data: responseData ? [responseData] : [], error: responseError }),
  })
  return { from: vi.fn().mockReturnValue(chainable), _chainable: chainable } as any
}

describe('validateRuleConfig', () => {
  it('accepts valid stop_loss config', () => {
    expect(validateRuleConfig('stop_loss', { threshold_price: 0.30 })).toBeNull()
  })

  it('rejects stop_loss with threshold_price >= 1', () => {
    expect(validateRuleConfig('stop_loss', { threshold_price: 1.0 })).toContain('between 0 and 1')
  })

  it('rejects stop_loss with threshold_price <= 0', () => {
    expect(validateRuleConfig('stop_loss', { threshold_price: 0 })).toContain('between 0 and 1')
  })

  it('accepts valid take_profit config', () => {
    expect(validateRuleConfig('take_profit', { threshold_price: 0.85 })).toBeNull()
  })

  it('accepts valid trailing_stop config', () => {
    expect(validateRuleConfig('trailing_stop', { trail_percent: 10 })).toBeNull()
  })

  it('rejects trailing_stop with trail_percent >= 100', () => {
    expect(validateRuleConfig('trailing_stop', { trail_percent: 100 })).toContain('between 0 and 100')
  })

  it('accepts valid time_exit config', () => {
    expect(validateRuleConfig('time_exit', { exit_hours_before_close: 24 })).toBeNull()
  })

  it('rejects time_exit with non-positive hours', () => {
    expect(validateRuleConfig('time_exit', { exit_hours_before_close: 0 })).toContain('positive number')
  })

  it('rejects unknown rule type', () => {
    expect(validateRuleConfig('unknown' as any, {})).toContain('Unknown rule_type')
  })
})

describe('createRule', () => {
  it('returns error on invalid config', async () => {
    const supabase = createMockSupabase()
    const result = await createRule(supabase, {
      agentId: 'a1',
      orgId: 'o1',
      conditionId: '0x123',
      tokenId: 't1',
      outcome: 'Yes',
      ruleType: 'stop_loss',
      ruleConfig: { threshold_price: 2.0 } as any, // invalid
      exitAction: 'sell_yes',
    })
    expect(result.error).toContain('between 0 and 1')
    expect(result.data).toBeNull()
  })

  it('calls supabase insert with correct table', async () => {
    const mockRule = { id: 'r1', rule_type: 'stop_loss' }
    const supabase = createMockSupabase(mockRule)
    await createRule(supabase, {
      agentId: 'a1',
      orgId: 'o1',
      conditionId: '0x123',
      tokenId: 't1',
      outcome: 'Yes',
      ruleType: 'stop_loss',
      ruleConfig: { threshold_price: 0.30 },
      exitAction: 'sell_yes',
    })
    expect(supabase.from).toHaveBeenCalledWith('polymarket_automation_rules')
  })
})
