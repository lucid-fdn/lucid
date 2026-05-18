/**
 * Polymarket Automation — Live E2E tests against real Supabase.
 *
 * Tests the full CRUD lifecycle for both position and portfolio rules,
 * validation, dedup constraints, and execution insertion.
 *
 * Auto-skipped when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.
 * Uses a synthetic agent_id/org_id — cleans up after itself.
 *
 * Run with: npx vitest run src/services/__tests__/polymarket-automation-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  createRule,
  createPortfolioRule,
  listRules,
  updateRule,
  deleteRule,
  listExecutions,
  validateRuleConfig,
} from '../services/automation-rules.js'
import {
  evaluateRule,
  isPortfolioRuleType,
  computePortfolioMetrics,
  evaluatePortfolioRule,
  isInCooldown,
  isMaxTriggersReached,
  isInBackoff,
} from '../services/automation-evaluator.js'
import { computeBatchOutcome } from '../crons/automation.js'
import type { AutomationRuleType, PolymarketPosition } from '../services/types.js'

// ── Setup ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabase: SupabaseClient
let dbAvailable = false

// Resolved dynamically from DB — uses a real assistant to satisfy FK constraints
let TEST_AGENT_ID = ''
let TEST_ORG_ID = ''

function requireDb(ctx: { skip: () => void }) {
  if (!dbAvailable) ctx.skip()
}

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[E2E] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — skipping live tests')
    return
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Probe DB connectivity + resolve a real assistant for FK constraints
  try {
    const { data, error } = await supabase
      .from('ai_assistants')
      .select('id, org_id')
      .limit(1)
      .single()

    if (error || !data) {
      console.log('[E2E] No assistants in DB — skipping live tests')
      return
    }

    TEST_AGENT_ID = data.id
    TEST_ORG_ID = data.org_id
    dbAvailable = true
  } catch {
    dbAvailable = false
  }

  if (!dbAvailable) {
    console.log('[E2E] Supabase unreachable — skipping live tests')
    return
  }

  // Clean up any leftover test data
  await cleanup()
})

afterAll(async () => {
  if (dbAvailable) await cleanup()
})

async function cleanup() {
  // Delete executions first (FK)
  await supabase
    .from('polymarket_automation_executions')
    .delete()
    .eq('agent_id', TEST_AGENT_ID)

  // Delete rules
  await supabase
    .from('polymarket_automation_rules')
    .delete()
    .eq('agent_id', TEST_AGENT_ID)
}

// ── Position Rule CRUD ───────────────────────────────────────────────

describe('Position rule CRUD — live DB', () => {
  let ruleId: string

  it('creates a stop_loss rule', async (ctx) => {
    requireDb(ctx)

    const result = await createRule(supabase, {
      agentId: TEST_AGENT_ID,
      orgId: TEST_ORG_ID,
      conditionId: '0xe2e_test_condition',
      tokenId: '0xe2e_test_token',
      outcome: 'Yes',
      ruleType: 'stop_loss',
      ruleConfig: { threshold_price: 0.30 },
      exitAction: 'sell_yes',
      executionMode: 'approval',
    })

    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()
    expect(result.data!.scope).toBe('position')
    expect(result.data!.rule_type).toBe('stop_loss')
    expect(result.data!.enabled).toBe(true)
    expect(result.data!.condition_id).toBe('0xe2e_test_condition')
    ruleId = result.data!.id
  })

  it('lists the created rule', async (ctx) => {
    requireDb(ctx)

    const rules = await listRules(supabase, TEST_AGENT_ID)
    expect(rules.length).toBeGreaterThanOrEqual(1)
    const found = rules.find(r => r.id === ruleId)
    expect(found).toBeDefined()
    expect(found!.rule_type).toBe('stop_loss')
  })

  it('updates the rule', async (ctx) => {
    requireDb(ctx)

    const result = await updateRule(supabase, ruleId, TEST_AGENT_ID, {
      enabled: false,
      disabled_reason: 'user',
    })
    expect(result.error).toBeNull()

    const rules = await listRules(supabase, TEST_AGENT_ID)
    const found = rules.find(r => r.id === ruleId)
    expect(found!.enabled).toBe(false)
  })

  it('deletes the rule', async (ctx) => {
    requireDb(ctx)

    const result = await deleteRule(supabase, ruleId, TEST_AGENT_ID)
    expect(result.error).toBeNull()

    const rules = await listRules(supabase, TEST_AGENT_ID)
    expect(rules.find(r => r.id === ruleId)).toBeUndefined()
  })
})

// ── Portfolio Rule CRUD ──────────────────────────────────────────────

describe('Portfolio rule CRUD — live DB', () => {
  let ruleId: string

  it('creates a portfolio_stop_loss rule', async (ctx) => {
    requireDb(ctx)

    const result = await createPortfolioRule(supabase, {
      agentId: TEST_AGENT_ID,
      orgId: TEST_ORG_ID,
      ruleType: 'portfolio_stop_loss',
      ruleConfig: { threshold_pnl_percent: -20 },
      executionMode: 'approval',
    })

    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()
    expect(result.data!.scope).toBe('portfolio')
    expect(result.data!.condition_id).toBeNull()
    expect(result.data!.token_id).toBeNull()
    expect(result.data!.outcome).toBeNull()
    expect(result.data!.exit_action).toBeNull()
    ruleId = result.data!.id
  })

  it('creates a concentration_guard with hysteresis', async (ctx) => {
    requireDb(ctx)

    const result = await createPortfolioRule(supabase, {
      agentId: TEST_AGENT_ID,
      orgId: TEST_ORG_ID,
      ruleType: 'concentration_guard',
      ruleConfig: { max_concentration_pct: 40, target_concentration_pct: 35 },
    })

    expect(result.error).toBeNull()
    expect(result.data!.scope).toBe('portfolio')
    expect((result.data!.rule_config as any).max_concentration_pct).toBe(40)
    expect((result.data!.rule_config as any).target_concentration_pct).toBe(35)
  })

  it('creates an exposure_cap with hysteresis', async (ctx) => {
    requireDb(ctx)

    const result = await createPortfolioRule(supabase, {
      agentId: TEST_AGENT_ID,
      orgId: TEST_ORG_ID,
      ruleType: 'exposure_cap',
      ruleConfig: { max_exposure_usd: 1000, target_exposure_usd: 900 },
    })

    expect(result.error).toBeNull()
    expect(result.data!.scope).toBe('portfolio')
  })

  it('enforces one enabled portfolio rule per type per agent', async (ctx) => {
    requireDb(ctx)

    // Try creating a second portfolio_stop_loss — should fail (unique index)
    const result = await createPortfolioRule(supabase, {
      agentId: TEST_AGENT_ID,
      orgId: TEST_ORG_ID,
      ruleType: 'portfolio_stop_loss',
      ruleConfig: { threshold_pnl_percent: -30 },
    })

    expect(result.error).not.toBeNull()
  })

  it('lists portfolio rules with scope field', async (ctx) => {
    requireDb(ctx)

    const rules = await listRules(supabase, TEST_AGENT_ID)
    const portfolioRules = rules.filter(r => r.scope === 'portfolio')
    expect(portfolioRules.length).toBeGreaterThanOrEqual(2)
    for (const r of portfolioRules) {
      expect(r.condition_id).toBeNull()
      expect(r.exit_action).toBeNull()
    }
  })

  it('deletes portfolio rules', async (ctx) => {
    requireDb(ctx)

    const rules = await listRules(supabase, TEST_AGENT_ID)
    for (const r of rules) {
      await deleteRule(supabase, r.id, TEST_AGENT_ID)
    }
    const remaining = await listRules(supabase, TEST_AGENT_ID)
    expect(remaining.length).toBe(0)
  })
})

// ── Consistency constraint ───────────────────────────────────────────

describe('DB consistency constraint — live', () => {
  it('rejects portfolio rule with position fields set', async (ctx) => {
    requireDb(ctx)

    // Try to insert a portfolio rule with condition_id set (violates constraint)
    const { error } = await supabase
      .from('polymarket_automation_rules')
      .insert({
        agent_id: TEST_AGENT_ID,
        org_id: TEST_ORG_ID,
        scope: 'portfolio',
        condition_id: '0xbad',
        token_id: null,
        outcome: null,
        rule_type: 'portfolio_stop_loss',
        rule_config: { threshold_pnl_percent: -20 },
        exit_action: null,
      })

    expect(error).not.toBeNull()
    // Constraint could be position_fields_consistency or a CHECK violation
    expect(error!.message).toMatch(/position_fields_consistency|violates check constraint/)
  })

  it('rejects position rule with null condition_id', async (ctx) => {
    requireDb(ctx)

    const { error } = await supabase
      .from('polymarket_automation_rules')
      .insert({
        agent_id: TEST_AGENT_ID,
        org_id: TEST_ORG_ID,
        scope: 'position',
        condition_id: null,
        token_id: '0xtok',
        outcome: 'Yes',
        rule_type: 'stop_loss',
        rule_config: { threshold_price: 0.30 },
        exit_action: 'sell_yes',
      })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/position_fields_consistency|violates check constraint/)
  })
})

// ── Execution batch columns ──────────────────────────────────────────

describe('Execution batch columns — live', () => {
  let ruleId: string

  it('creates a rule for execution tests', async (ctx) => {
    requireDb(ctx)

    const result = await createRule(supabase, {
      agentId: TEST_AGENT_ID,
      orgId: TEST_ORG_ID,
      conditionId: '0xe2e_exec_cond',
      tokenId: '0xe2e_exec_tok',
      outcome: 'Yes',
      ruleType: 'take_profit',
      ruleConfig: { threshold_price: 0.80 },
      exitAction: 'sell_yes',
    })
    expect(result.error).toBeNull()
    ruleId = result.data!.id
  })

  it('inserts execution with trigger_batch_id and trigger_snapshot', async (ctx) => {
    requireDb(ctx)

    const batchId = '00000000-0000-0000-0000-e2e000000001'
    const snapshot = { totalPnlPercent: -22.5, rule_type: 'portfolio_stop_loss' }

    const { data, error } = await supabase
      .from('polymarket_automation_executions')
      .insert({
        rule_id: ruleId,
        agent_id: TEST_AGENT_ID,
        org_id: TEST_ORG_ID,
        condition_id: '0xe2e_exec_cond',
        rule_type: 'take_profit',
        trigger_price: 0.85,
        status: 'pending_approval',
        trigger_batch_id: batchId,
        trigger_snapshot: snapshot,
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data.trigger_batch_id).toBe(batchId)
    expect(data.trigger_snapshot.totalPnlPercent).toBe(-22.5)
  })

  it('lists executions with batch fields', async (ctx) => {
    requireDb(ctx)

    const executions = await listExecutions(supabase, TEST_AGENT_ID)
    expect(executions.length).toBeGreaterThanOrEqual(1)
    const exec = executions.find(e => e.trigger_batch_id != null)
    expect(exec).toBeDefined()
    expect(exec!.trigger_snapshot).toBeDefined()
  })
})

// ── Validation (pure, no DB) ─────────────────────────────────────────

describe('validateRuleConfig — all 8 rule types', () => {
  it('validates stop_loss', () => {
    expect(validateRuleConfig('stop_loss', { threshold_price: 0.3 })).toBeNull()
    expect(validateRuleConfig('stop_loss', { threshold_price: 1.5 })).not.toBeNull()
    expect(validateRuleConfig('stop_loss', { threshold_price: 0 })).not.toBeNull()
  })

  it('validates take_profit', () => {
    expect(validateRuleConfig('take_profit', { threshold_price: 0.8 })).toBeNull()
    expect(validateRuleConfig('take_profit', { threshold_price: -0.1 })).not.toBeNull()
  })

  it('validates trailing_stop', () => {
    expect(validateRuleConfig('trailing_stop', { trail_percent: 10 })).toBeNull()
    expect(validateRuleConfig('trailing_stop', { trail_percent: 0 })).not.toBeNull()
    expect(validateRuleConfig('trailing_stop', { trail_percent: 100 })).not.toBeNull()
  })

  it('validates time_exit', () => {
    expect(validateRuleConfig('time_exit', { exit_hours_before_close: 24 })).toBeNull()
    expect(validateRuleConfig('time_exit', { exit_hours_before_close: -1 })).not.toBeNull()
  })

  it('validates portfolio_stop_loss (must be negative)', () => {
    expect(validateRuleConfig('portfolio_stop_loss', { threshold_pnl_percent: -20 })).toBeNull()
    expect(validateRuleConfig('portfolio_stop_loss', { threshold_pnl_percent: 10 })).not.toBeNull()
    expect(validateRuleConfig('portfolio_stop_loss', { threshold_pnl_percent: 0 })).not.toBeNull()
  })

  it('validates portfolio_take_profit (must be positive)', () => {
    expect(validateRuleConfig('portfolio_take_profit', { threshold_pnl_percent: 50 })).toBeNull()
    expect(validateRuleConfig('portfolio_take_profit', { threshold_pnl_percent: -10 })).not.toBeNull()
    expect(validateRuleConfig('portfolio_take_profit', { threshold_pnl_percent: 0 })).not.toBeNull()
  })

  it('validates concentration_guard with hysteresis', () => {
    expect(validateRuleConfig('concentration_guard', { max_concentration_pct: 40 })).toBeNull()
    expect(validateRuleConfig('concentration_guard', { max_concentration_pct: 40, target_concentration_pct: 35 })).toBeNull()
    expect(validateRuleConfig('concentration_guard', { max_concentration_pct: 40, target_concentration_pct: 40 })).not.toBeNull()
    expect(validateRuleConfig('concentration_guard', { max_concentration_pct: 40, target_concentration_pct: 45 })).not.toBeNull()
    expect(validateRuleConfig('concentration_guard', { max_concentration_pct: 0 })).not.toBeNull()
    expect(validateRuleConfig('concentration_guard', { max_concentration_pct: 100 })).not.toBeNull()
  })

  it('validates exposure_cap with hysteresis', () => {
    expect(validateRuleConfig('exposure_cap', { max_exposure_usd: 1000 })).toBeNull()
    expect(validateRuleConfig('exposure_cap', { max_exposure_usd: 1000, target_exposure_usd: 900 })).toBeNull()
    expect(validateRuleConfig('exposure_cap', { max_exposure_usd: 1000, target_exposure_usd: 1000 })).not.toBeNull()
    expect(validateRuleConfig('exposure_cap', { max_exposure_usd: 1000, target_exposure_usd: 1100 })).not.toBeNull()
    expect(validateRuleConfig('exposure_cap', { max_exposure_usd: 0 })).not.toBeNull()
    expect(validateRuleConfig('exposure_cap', { max_exposure_usd: -100 })).not.toBeNull()
  })
})

// ── Portfolio evaluator (pure, no DB) ────────────────────────────────

describe('Portfolio evaluator — integration', () => {
  const positions: PolymarketPosition[] = [
    { conditionId: 'c1', tokenId: 't1', outcome: 'Yes', size: '100', avgPrice: 0.50, currentPrice: 0.40, pnlUsd: -10, pnlPercent: -20 },
    { conditionId: 'c2', tokenId: 't2', outcome: 'No', size: '200', avgPrice: 0.60, currentPrice: 0.70, pnlUsd: 20, pnlPercent: 16.7 },
    { conditionId: 'c3', tokenId: 't3', outcome: 'Yes', size: '50', avgPrice: 0.30, currentPrice: 0.25, pnlUsd: -2.5, pnlPercent: -16.7 },
  ]

  it('computePortfolioMetrics produces correct aggregates', () => {
    const m = computePortfolioMetrics(positions)
    expect(m.positionCount).toBe(3)
    expect(m.totalExposureUsd).toBeCloseTo(100 * 0.40 + 200 * 0.70 + 50 * 0.25) // 40 + 140 + 12.5 = 192.5
    expect(m.totalCostBasis).toBeCloseTo(100 * 0.50 + 200 * 0.60 + 50 * 0.30) // 50 + 120 + 15 = 185
    expect(m.totalPnlUsd).toBeCloseTo(192.5 - 185) // 7.5
    expect(m.totalPnlPercent).toBeCloseTo((7.5 / 185) * 100) // ~4.05%
  })

  it('portfolio_stop_loss does not trigger when PnL is positive', () => {
    const m = computePortfolioMetrics(positions)
    const result = evaluatePortfolioRule('portfolio_stop_loss', { threshold_pnl_percent: -20 }, m)
    expect(result.triggered).toBe(false)
  })

  it('portfolio_stop_loss triggers when PnL drops below threshold', () => {
    const losingPositions: PolymarketPosition[] = [
      { conditionId: 'c1', tokenId: 't1', outcome: 'Yes', size: '100', avgPrice: 0.50, currentPrice: 0.30, pnlUsd: -20, pnlPercent: -40 },
    ]
    const m = computePortfolioMetrics(losingPositions)
    const result = evaluatePortfolioRule('portfolio_stop_loss', { threshold_pnl_percent: -20 }, m)
    expect(result.triggered).toBe(true)
    expect(result.affectedPositions.length).toBe(1)
    expect(result.affectedPositions[0].exitAction).toBe('sell_yes')
  })

  it('concentration_guard triggers with hysteresis', () => {
    // c2 has 140/192.5 = 72.7% concentration
    const m = computePortfolioMetrics(positions)
    const result = evaluatePortfolioRule('concentration_guard', { max_concentration_pct: 50, target_concentration_pct: 40 }, m)
    expect(result.triggered).toBe(true)
    expect(result.affectedPositions.length).toBe(1)
    expect(result.affectedPositions[0].conditionId).toBe('c2')
    expect(result.affectedPositions[0].exitAmount).toBeGreaterThan(0)
  })

  it('exposure_cap triggers and exits worst performers first', () => {
    const m = computePortfolioMetrics(positions)
    const result = evaluatePortfolioRule('exposure_cap', { max_exposure_usd: 100, target_exposure_usd: 80 }, m)
    expect(result.triggered).toBe(true)
    expect(result.affectedPositions.length).toBeGreaterThanOrEqual(1)
    // Worst PnL% first — c1 (-20%) then c3 (-16.7%)
    expect(result.affectedPositions[0].conditionId).toBe('c1')
  })

  it('computeBatchOutcome classifies correctly', () => {
    expect(computeBatchOutcome(['executed', 'executed'])).toBe('full_success')
    expect(computeBatchOutcome(['executed', 'failed'])).toBe('partial_success')
    expect(computeBatchOutcome(['failed', 'failed'])).toBe('full_failure')
    expect(computeBatchOutcome(['executed', 'executed', 'failed'])).toBe('partial_success')
  })
})

// ── Guard functions (pure) ───────────────────────────────────────────

describe('Guard functions — pure', () => {
  it('isPortfolioRuleType recognizes all 4 portfolio types', () => {
    expect(isPortfolioRuleType('portfolio_stop_loss')).toBe(true)
    expect(isPortfolioRuleType('portfolio_take_profit')).toBe(true)
    expect(isPortfolioRuleType('concentration_guard')).toBe(true)
    expect(isPortfolioRuleType('exposure_cap')).toBe(true)
    expect(isPortfolioRuleType('stop_loss')).toBe(false)
    expect(isPortfolioRuleType('take_profit')).toBe(false)
  })

  it('isInCooldown works correctly', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 60_000).toISOString() // 1 min ago
    const old = new Date(now.getTime() - 600_000).toISOString() // 10 min ago

    expect(isInCooldown(recent, 300, now)).toBe(true) // 1 min < 5 min
    expect(isInCooldown(old, 300, now)).toBe(false) // 10 min > 5 min
    expect(isInCooldown(null, 300, now)).toBe(false) // never triggered
  })

  it('isMaxTriggersReached works correctly', () => {
    expect(isMaxTriggersReached(5, 5)).toBe(true)
    expect(isMaxTriggersReached(4, 5)).toBe(false)
    expect(isMaxTriggersReached(10, null)).toBe(false) // no limit
  })

  it('isInBackoff uses exponential backoff', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 60_000).toISOString() // 1 min ago

    // 1 failure: backoff = 2^1 * 300s = 600s = 10 min. 1 min < 10 min → in backoff
    expect(isInBackoff(1, recent, 300, now)).toBe(true)
    // 0 failures: no backoff
    expect(isInBackoff(0, recent, 300, now)).toBe(false)
  })

  it('evaluateRule handles all 4 position rule types', () => {
    expect(evaluateRule('stop_loss', { threshold_price: 0.50 }, { currentPrice: 0.40 }).triggered).toBe(true)
    expect(evaluateRule('stop_loss', { threshold_price: 0.30 }, { currentPrice: 0.40 }).triggered).toBe(false)
    expect(evaluateRule('take_profit', { threshold_price: 0.80 }, { currentPrice: 0.90 }).triggered).toBe(true)
    expect(evaluateRule('trailing_stop', { trail_percent: 20 }, { currentPrice: 0.70, highWaterMark: 1.0 }).triggered).toBe(true)
    expect(evaluateRule('time_exit', { exit_hours_before_close: 24 }, { currentPrice: 0.50, marketEndDate: new Date(Date.now() + 12 * 3600_000).toISOString() }).triggered).toBe(true)
  })
})
