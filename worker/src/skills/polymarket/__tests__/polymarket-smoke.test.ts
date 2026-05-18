/**
 * E2E smoke tests — polymarket_trade tool registration + dispatch.
 *
 * Verifies:
 *   1. Tool is registered in BUILT_IN_TOOLS with correct schema
 *   2. Tool is in ELEVATED_TRADING_TOOLS and TRADING_TOOLS sets
 *   3. Capability system grants access via execute:predictions
 *   4. BuiltInToolExecutor recognizes it as a built-in tool
 *   5. CommandsAllowlist gates it correctly (elevated, not default-allowed without policy)
 *   6. Platform tool module exports the handler
 */

import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_TOOLS,
  ELEVATED_TRADING_TOOLS,
  TRADING_TOOLS,
  CAPABILITY_TOOLS,
  CommandsAllowlist,
} from '../../../agent/CommandsAllowlist.js'
import { isBuiltInTool, BUILT_IN_TOOL_NAMES } from '../../../agent/BuiltInToolExecutor.js'

describe('polymarket_trade registration', () => {
  // ── Schema ──

  it('is registered in BUILT_IN_TOOLS', () => {
    expect(BUILT_IN_TOOLS).toHaveProperty('polymarket_trade')
  })

  it('has correct schema properties', () => {
    const schema = BUILT_IN_TOOLS.polymarket_trade
    expect(schema.name).toBe('polymarket_trade')
    expect(schema.category).toBe('trading')
    expect(schema.dangerLevel).toBe('elevated')
    expect(schema.requires_confirmation).toBe(true)
  })

  it('has action enum with all 14 actions', () => {
    const params = BUILT_IN_TOOLS.polymarket_trade.parameters as {
      properties: { action: { enum: string[] } }
    }
    const actions = params.properties.action.enum
    expect(actions).toContain('search')
    expect(actions).toContain('market_info')
    expect(actions).toContain('orderbook')
    expect(actions).toContain('buy_yes')
    expect(actions).toContain('buy_no')
    expect(actions).toContain('sell_yes')
    expect(actions).toContain('sell_no')
    expect(actions).toContain('split_and_sell')
    expect(actions).toContain('open_orders')
    expect(actions).toContain('cancel_order')
    expect(actions).toContain('cancel_orders')
    expect(actions).toContain('cancel_all')
    expect(actions).toContain('redeem')
    expect(actions).toContain('get_positions')
    expect(actions).toHaveLength(14)
  })

  it('requires only action parameter', () => {
    const params = BUILT_IN_TOOLS.polymarket_trade.parameters as {
      required: string[]
    }
    expect(params.required).toEqual(['action'])
  })

  // ── Sets ──

  it('is in ELEVATED_TRADING_TOOLS', () => {
    expect(ELEVATED_TRADING_TOOLS.has('polymarket_trade')).toBe(true)
  })

  it('is in TRADING_TOOLS', () => {
    expect(TRADING_TOOLS.has('polymarket_trade')).toBe(true)
  })

  // ── Capabilities ──

  it('is gated by execute:predictions capability', () => {
    expect(CAPABILITY_TOOLS['execute:predictions']).toContain('polymarket_trade')
  })

  // ── CommandsAllowlist ──

  it('is NOT auto-allowed without policy (elevated requires explicit grant)', () => {
    const allowlist = new CommandsAllowlist({ capabilities: [] })
    expect(allowlist.isAllowed('polymarket_trade')).toBe(false)
  })

  it('is allowed when execute:predictions capability is granted', () => {
    const allowlist = new CommandsAllowlist({ capabilities: ['execute:predictions'] })
    expect(allowlist.isAllowed('polymarket_trade')).toBe(true)
  })

  it('is allowed when no policy config at all (backwards compat)', () => {
    const allowlist = new CommandsAllowlist(null)
    expect(allowlist.isAllowed('polymarket_trade')).toBe(true)
  })

  it('is flagged as elevated trading tool', () => {
    const allowlist = new CommandsAllowlist(null)
    expect(allowlist.isElevatedTradingTool('polymarket_trade')).toBe(true)
    expect(allowlist.isTradingTool('polymarket_trade')).toBe(true)
  })

  // ── BuiltInToolExecutor ──

  it('is recognized by BuiltInToolExecutor', () => {
    expect(isBuiltInTool('polymarket_trade')).toBe(true)
    expect(BUILT_IN_TOOL_NAMES.has('polymarket_trade')).toBe(true)
  })

  // ── Module exports ──

  it('platform-tools module exports the handler', async () => {
    const mod = await import('../../../agent/platform-tools/index.js')
    expect(typeof mod.toolPolymarketTrade).toBe('function')
  })
})

describe('polymarket_trade schema quality', () => {
  it('has when_to_use hints', () => {
    const schema = BUILT_IN_TOOLS.polymarket_trade
    expect(schema.when_to_use).toBeDefined()
    expect(schema.when_to_use!.length).toBeGreaterThan(0)
  })

  it('has examples', () => {
    const schema = BUILT_IN_TOOLS.polymarket_trade
    expect(schema.examples).toBeDefined()
    expect(schema.examples!.length).toBeGreaterThan(0)
  })

  it('has related_tools', () => {
    const schema = BUILT_IN_TOOLS.polymarket_trade
    expect(schema.related_tools).toBeDefined()
    expect(schema.related_tools!.length).toBeGreaterThan(0)
  })

  it('description mentions Polymarket', () => {
    const schema = BUILT_IN_TOOLS.polymarket_trade
    expect(schema.description.toLowerCase()).toContain('polymarket')
  })
})
