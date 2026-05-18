/**
 * Smoke tests — polymarket_automation tool registration + wiring.
 *
 * Verifies:
 *   1. Tool is registered in BUILT_IN_TOOLS with correct schema
 *   2. Tool is in TRADING_TOOLS set
 *   3. Capability system grants access via read:predictions_automation + manage:predictions_automation
 *   4. BuiltInToolExecutor recognizes it as a built-in tool
 *   5. CommandsAllowlist gates it correctly (safe, auto-allowed for reads)
 *   6. Tool module exports the handler
 *   7. Cron module exports the evaluator
 *   8. Evaluator module exports pure functions
 *   9. Types are exported from barrel
 */

import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_TOOLS,
  TRADING_TOOLS,
  CAPABILITY_TOOLS,
  CommandsAllowlist,
} from '../../../agent/CommandsAllowlist.js'
import { isBuiltInTool, BUILT_IN_TOOL_NAMES } from '../../../agent/BuiltInToolExecutor.js'

describe('polymarket_automation registration', () => {
  it('is registered in BUILT_IN_TOOLS', () => {
    expect(BUILT_IN_TOOLS).toHaveProperty('polymarket_automation')
  })

  it('has correct schema properties', () => {
    const schema = BUILT_IN_TOOLS.polymarket_automation
    expect(schema.name).toBe('polymarket_automation')
    expect(schema.category).toBe('trading')
    expect(schema.dangerLevel).toBe('safe')
  })

  it('has action enum with 5 actions', () => {
    const params = BUILT_IN_TOOLS.polymarket_automation.parameters as {
      properties: { action: { enum: string[] } }
    }
    const actions = params.properties.action.enum
    expect(actions).toContain('list_rules')
    expect(actions).toContain('list_executions')
    expect(actions).toContain('create_rule')
    expect(actions).toContain('update_rule')
    expect(actions).toContain('delete_rule')
    expect(actions).toHaveLength(5)
  })

  it('has 8 rule types in schema (4 position + 4 portfolio)', () => {
    const params = BUILT_IN_TOOLS.polymarket_automation.parameters as {
      properties: { rule_type: { enum: string[] } }
    }
    const ruleTypes = params.properties.rule_type.enum
    expect(ruleTypes).toContain('stop_loss')
    expect(ruleTypes).toContain('portfolio_stop_loss')
    expect(ruleTypes).toContain('portfolio_take_profit')
    expect(ruleTypes).toContain('concentration_guard')
    expect(ruleTypes).toContain('exposure_cap')
    expect(ruleTypes).toHaveLength(8)
  })

  it('has portfolio-specific parameters', () => {
    const params = BUILT_IN_TOOLS.polymarket_automation.parameters as {
      properties: Record<string, any>
    }
    expect(params.properties.threshold_pnl_percent).toBeDefined()
    expect(params.properties.max_concentration_pct).toBeDefined()
    expect(params.properties.target_concentration_pct).toBeDefined()
    expect(params.properties.max_exposure_usd).toBeDefined()
    expect(params.properties.target_exposure_usd).toBeDefined()
  })

  it('requires only action parameter', () => {
    const params = BUILT_IN_TOOLS.polymarket_automation.parameters as {
      required: string[]
    }
    expect(params.required).toEqual(['action'])
  })

  it('is in TRADING_TOOLS', () => {
    expect(TRADING_TOOLS.has('polymarket_automation')).toBe(true)
  })

  it('is gated by read:predictions_automation capability', () => {
    expect(CAPABILITY_TOOLS['read:predictions_automation']).toContain('polymarket_automation')
  })

  it('is gated by manage:predictions_automation capability', () => {
    expect(CAPABILITY_TOOLS['manage:predictions_automation']).toContain('polymarket_automation')
  })

  it('read:predictions_automation is a safe capability (auto-granted)', () => {
    const allowlist = new CommandsAllowlist({ capabilities: [] })
    // polymarket_automation is safe (dangerLevel='safe') so it should be auto-allowed
    expect(allowlist.isAllowed('polymarket_automation')).toBe(true)
  })

  it('is recognized by BuiltInToolExecutor', () => {
    expect(isBuiltInTool('polymarket_automation')).toBe(true)
    expect(BUILT_IN_TOOL_NAMES.has('polymarket_automation')).toBe(true)
  })

  it('has when_to_use hints', () => {
    const schema = BUILT_IN_TOOLS.polymarket_automation
    expect(schema.when_to_use).toBeDefined()
    expect(schema.when_to_use!.length).toBeGreaterThan(0)
  })

  it('has examples', () => {
    const schema = BUILT_IN_TOOLS.polymarket_automation
    expect(schema.examples).toBeDefined()
    expect(schema.examples!.length).toBeGreaterThan(0)
  })

  it('has related_tools', () => {
    const schema = BUILT_IN_TOOLS.polymarket_automation
    expect(schema.related_tools).toBeDefined()
    expect(schema.related_tools).toContain('polymarket_trade')
  })
})

describe('polymarket_automation module exports', () => {
  it('tool module exports the handler', async () => {
    const mod = await import('../tools/automation.js')
    expect(typeof mod.toolPolymarketAutomation).toBe('function')
  })

  it('cron module exports the evaluator', async () => {
    const mod = await import('../crons/automation.js')
    expect(typeof mod.evaluateAutomationRules).toBe('function')
  })

  it('evaluator module exports pure functions', async () => {
    const mod = await import('../services/automation-evaluator.js')
    expect(typeof mod.evaluateRule).toBe('function')
    expect(typeof mod.isInCooldown).toBe('function')
    expect(typeof mod.isMaxTriggersReached).toBe('function')
  })

  it('types are exported from barrel', async () => {
    const mod = await import('../services/index.js')
    // Type-only exports are verified at compile time; just check the module loads
    expect(mod).toBeDefined()
  })

  it('isInBackoff is exported from barrel', async () => {
    const mod = await import('../services/index.js')
    expect(typeof mod.isInBackoff).toBe('function')
  })

  it('TERMINAL_NON_FAILURE_STATUSES is exported from barrel', async () => {
    const mod = await import('../services/index.js')
    expect(mod.TERMINAL_NON_FAILURE_STATUSES).toContain('below_minimum')
    expect(mod.TERMINAL_NON_FAILURE_STATUSES).toContain('no_position')
    expect(mod.TERMINAL_NON_FAILURE_STATUSES).toContain('market_unavailable')
  })

  it('execute:predictions_automation capability is registered', () => {
    expect(CAPABILITY_TOOLS['execute:predictions_automation']).toContain('polymarket_automation')
  })

  it('execute:predictions_portfolio capability is registered', () => {
    expect(CAPABILITY_TOOLS['execute:predictions_portfolio']).toContain('polymarket_automation')
  })

  it('portfolio evaluator functions are exported from barrel', async () => {
    const mod = await import('../services/index.js')
    expect(typeof mod.isPortfolioRuleType).toBe('function')
    expect(typeof mod.computePortfolioMetrics).toBe('function')
    expect(typeof mod.evaluatePortfolioRule).toBe('function')
    expect(typeof mod.evaluatePortfolioStopLoss).toBe('function')
    expect(typeof mod.evaluateConcentrationGuard).toBe('function')
    expect(typeof mod.evaluateExposureCap).toBe('function')
  })

  it('createPortfolioRule is exported from barrel', async () => {
    const mod = await import('../services/index.js')
    expect(typeof mod.createPortfolioRule).toBe('function')
  })

  it('computeBatchOutcome is exported from cron module', async () => {
    const mod = await import('../crons/automation.js')
    expect(typeof mod.computeBatchOutcome).toBe('function')
  })

  it('has execution_mode in tool schema', () => {
    const params = BUILT_IN_TOOLS.polymarket_automation.parameters as {
      properties: Record<string, any>
    }
    expect(params.properties.execution_mode).toBeDefined()
    expect(params.properties.execution_mode.enum).toContain('approval')
    expect(params.properties.execution_mode.enum).toContain('auto_execute')
  })
})
