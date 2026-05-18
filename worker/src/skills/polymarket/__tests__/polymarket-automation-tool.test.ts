/**
 * Tests for polymarket_automation tool handler — action dispatch + capability checks.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock dependencies
vi.mock('../services/automation-rules.js', () => ({
  createRule: vi.fn().mockResolvedValue({ data: { id: 'r1', rule_type: 'stop_loss', rule_config: { threshold_price: 0.30 }, exit_action: 'sell_yes', exit_amount_pct: 100, enabled: true, execution_mode: 'approval' }, error: null }),
  createPortfolioRule: vi.fn().mockResolvedValue({ data: { id: 'pr1', scope: 'portfolio', rule_type: 'portfolio_stop_loss', rule_config: { threshold_pnl_percent: -20 }, enabled: true, execution_mode: 'approval' }, error: null }),
  listRules: vi.fn().mockResolvedValue([]),
  updateRule: vi.fn().mockResolvedValue({ error: null }),
  deleteRule: vi.fn().mockResolvedValue({ error: null }),
  listExecutions: vi.fn().mockResolvedValue([]),
}))

vi.mock('../services/automation-evaluator.js', () => ({
  isPortfolioRuleType: vi.fn().mockImplementation((t: string) =>
    ['portfolio_stop_loss', 'portfolio_take_profit', 'concentration_guard', 'exposure_cap'].includes(t)),
}))

vi.mock('../services/position-aggregator.js', () => ({
  getPositions: vi.fn().mockResolvedValue([
    { conditionId: '0x123', tokenId: 't1', outcome: 'Yes', size: '100', avgPrice: 0.50, currentPrice: 0.50, pnlUsd: 0, pnlPercent: 0 },
  ]),
}))

vi.mock('../services/clob-client.js', () => ({
  getMarket: vi.fn().mockResolvedValue({
    condition_id: '0x123',
    tokens: [
      { token_id: 't1', outcome: 'Yes', price: 0.50 },
      { token_id: 't2', outcome: 'No', price: 0.50 },
    ],
  }),
}))

import { toolPolymarketAutomation } from '../tools/automation.js'
import { listRules, listExecutions, createRule, createPortfolioRule, updateRule, deleteRule } from '../services/automation-rules.js'

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { scope: 'position' }, error: null }),
        }),
      }),
    }),
  }),
} as any

describe('toolPolymarketAutomation', () => {
  it('returns error when action is missing', async () => {
    const result = JSON.parse(await toolPolymarketAutomation({}, 'a1', 'o1', mockSupabase, null))
    expect(result.error).toBe('action is required')
  })

  it('returns error for unknown action', async () => {
    const result = JSON.parse(await toolPolymarketAutomation({ action: 'unknown' }, 'a1', 'o1', mockSupabase, null))
    expect(result.error).toContain('Unknown action')
  })

  // ── Capability checks ──

  it('blocks read actions without read:predictions_automation capability', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'list_rules' },
        'a1', 'o1', mockSupabase,
        { capabilities: ['execute:predictions'] }, // missing read:predictions_automation
      ),
    )
    expect(result.error).toContain('read:predictions_automation')
  })

  it('blocks write actions without manage:predictions_automation capability', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', condition_id: '0x123', rule_type: 'stop_loss', threshold_price: 0.30, exit_action: 'sell_yes' },
        'a1', 'o1', mockSupabase,
        { capabilities: ['read:predictions_automation'] }, // missing manage
      ),
    )
    expect(result.error).toContain('manage:predictions_automation')
  })

  it('allows all actions when no policy config (backwards compat)', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation({ action: 'list_rules' }, 'a1', 'o1', mockSupabase, null),
    )
    expect(result.ok).toBe(true)
  })

  // ── list_rules ──

  it('lists rules successfully', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation({ action: 'list_rules' }, 'a1', 'o1', mockSupabase, null),
    )
    expect(result.ok).toBe(true)
    expect(result.rules).toBeDefined()
    expect(listRules).toHaveBeenCalledWith(mockSupabase, 'a1')
  })

  // ── list_executions ──

  it('lists executions successfully', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation({ action: 'list_executions' }, 'a1', 'o1', mockSupabase, null),
    )
    expect(result.ok).toBe(true)
    expect(result.executions).toBeDefined()
    expect(listExecutions).toHaveBeenCalledWith(mockSupabase, 'a1')
  })

  // ── create_rule ──

  it('requires condition_id for create_rule', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'stop_loss', exit_action: 'sell_yes' },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.error).toContain('condition_id')
  })

  it('requires rule_type for create_rule', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', condition_id: '0x123', exit_action: 'sell_yes' },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.error).toContain('rule_type')
  })

  it('creates stop_loss rule successfully', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', condition_id: '0x123', rule_type: 'stop_loss', threshold_price: 0.30, exit_action: 'sell_yes' },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.ok).toBe(true)
    expect(result.rule).toBeDefined()
    expect(result.message).toContain('Rule created')
  })

  // ── update_rule ──

  it('requires rule_id for update_rule', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation({ action: 'update_rule' }, 'a1', 'o1', mockSupabase, null),
    )
    expect(result.error).toContain('rule_id')
  })

  // ── delete_rule ──

  it('requires rule_id for delete_rule', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation({ action: 'delete_rule' }, 'a1', 'o1', mockSupabase, null),
    )
    expect(result.error).toContain('rule_id')
  })

  // ── execution_mode capability gating ──

  it('blocks auto_execute on create without execute:predictions_automation capability', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', condition_id: '0x123', rule_type: 'stop_loss', threshold_price: 0.30, exit_action: 'sell_yes', execution_mode: 'auto_execute' },
        'a1', 'o1', mockSupabase,
        { capabilities: ['manage:predictions_automation'] },
      ),
    )
    expect(result.error).toContain('execute:predictions_automation')
  })

  it('allows auto_execute on create with execute:predictions_automation capability', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', condition_id: '0x123', rule_type: 'stop_loss', threshold_price: 0.30, exit_action: 'sell_yes', execution_mode: 'auto_execute' },
        'a1', 'o1', mockSupabase,
        { capabilities: ['manage:predictions_automation', 'execute:predictions_automation'] },
      ),
    )
    expect(result.ok).toBe(true)
    expect(result.message).toContain('auto-execution')
  })

  it('blocks auto_execute on update without capability (position rule)', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'update_rule', rule_id: 'r1', execution_mode: 'auto_execute' },
        'a1', 'o1', mockSupabase,
        { capabilities: ['manage:predictions_automation'] },
      ),
    )
    expect(result.error).toContain('execute:predictions_automation')
  })

  it('blocks auto_execute on update without capability (portfolio rule)', async () => {
    // Mock supabase to return a portfolio rule
    const portfolioSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { scope: 'portfolio' }, error: null }),
            }),
          }),
        }),
      }),
    } as any
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'update_rule', rule_id: 'r1', execution_mode: 'auto_execute' },
        'a1', 'o1', portfolioSupabase,
        { capabilities: ['manage:predictions_automation', 'execute:predictions_automation'] },
      ),
    )
    expect(result.error).toContain('execute:predictions_portfolio')
  })

  it('allows approval mode without execute:predictions_automation', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', condition_id: '0x123', rule_type: 'stop_loss', threshold_price: 0.30, exit_action: 'sell_yes', execution_mode: 'approval' },
        'a1', 'o1', mockSupabase,
        { capabilities: ['manage:predictions_automation'] },
      ),
    )
    expect(result.ok).toBe(true)
    expect(result.message).toContain('approval')
  })

  // ── Phase 5C: Portfolio rule creation ──

  it('creates portfolio_stop_loss rule without condition_id or exit_action', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'portfolio_stop_loss', threshold_pnl_percent: -20 },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.ok).toBe(true)
    expect(result.rule.scope).toBe('portfolio')
    expect(createPortfolioRule).toHaveBeenCalled()
  })

  it('creates portfolio_take_profit rule', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'portfolio_take_profit', threshold_pnl_percent: 50 },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.ok).toBe(true)
  })

  it('creates concentration_guard with hysteresis', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'concentration_guard', max_concentration_pct: 40, target_concentration_pct: 35 },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.ok).toBe(true)
  })

  it('creates exposure_cap with hysteresis', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'exposure_cap', max_exposure_usd: 1000, target_exposure_usd: 900 },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.ok).toBe(true)
  })

  it('requires threshold_pnl_percent for portfolio_stop_loss', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'portfolio_stop_loss' },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.error).toContain('threshold_pnl_percent')
  })

  it('requires max_concentration_pct for concentration_guard', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'concentration_guard' },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.error).toContain('max_concentration_pct')
  })

  it('requires max_exposure_usd for exposure_cap', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'exposure_cap' },
        'a1', 'o1', mockSupabase, null,
      ),
    )
    expect(result.error).toContain('max_exposure_usd')
  })

  it('blocks auto_execute on portfolio without execute:predictions_portfolio capability', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'portfolio_stop_loss', threshold_pnl_percent: -20, execution_mode: 'auto_execute' },
        'a1', 'o1', mockSupabase,
        { capabilities: ['manage:predictions_automation'] },
      ),
    )
    expect(result.error).toContain('execute:predictions_portfolio')
  })

  it('allows auto_execute on portfolio with execute:predictions_portfolio capability', async () => {
    const result = JSON.parse(
      await toolPolymarketAutomation(
        { action: 'create_rule', rule_type: 'portfolio_stop_loss', threshold_pnl_percent: -20, execution_mode: 'auto_execute' },
        'a1', 'o1', mockSupabase,
        { capabilities: ['manage:predictions_automation', 'execute:predictions_portfolio'] },
      ),
    )
    expect(result.ok).toBe(true)
    expect(result.message).toContain('auto-execution')
  })
})
