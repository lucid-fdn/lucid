/**
 * Smoke tests — lucid_hedge tool registration, schema, capabilities, gating.
 */

import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_TOOLS,
  TRADING_TOOLS,
  CAPABILITY_TOOLS,
  CommandsAllowlist,
} from '../../../agent/CommandsAllowlist.js'
import { isBuiltInTool, BUILT_IN_TOOL_NAMES } from '../../../agent/BuiltInToolExecutor.js'

describe('lucid_hedge registration', () => {
  // ── Schema ──

  it('is registered in BUILT_IN_TOOLS', () => {
    expect(BUILT_IN_TOOLS).toHaveProperty('lucid_hedge')
  })

  it('has category blockchain (not trading)', () => {
    const schema = BUILT_IN_TOOLS.lucid_hedge
    expect(schema.category).toBe('blockchain')
    expect(schema.category).not.toBe('trading')
  })

  it('has dangerLevel safe', () => {
    expect(BUILT_IN_TOOLS.lucid_hedge.dangerLevel).toBe('safe')
  })

  it('has action enum with 3 actions', () => {
    const params = BUILT_IN_TOOLS.lucid_hedge.parameters as {
      properties: { action: { enum: string[] } }
    }
    const actions = params.properties.action.enum
    expect(actions).toContain('analyze_position')
    expect(actions).toContain('analyze_portfolio')
    expect(actions).toContain('suggest_hedge')
    expect(actions).toHaveLength(3)
  })

  it('requires only action parameter', () => {
    const params = BUILT_IN_TOOLS.lucid_hedge.parameters as {
      required: string[]
    }
    expect(params.required).toEqual(['action'])
  })

  // ── Sets ──

  it('is in TRADING_TOOLS', () => {
    expect(TRADING_TOOLS.has('lucid_hedge')).toBe(true)
  })

  // ── Capabilities ──

  it('is gated by reason:hedge capability', () => {
    expect(CAPABILITY_TOOLS['reason:hedge']).toContain('lucid_hedge')
  })

  // ── Allowlist (safe = auto-granted) ──

  it('is auto-allowed as a safe tool (no explicit grant needed)', () => {
    const allowlist = new CommandsAllowlist({ capabilities: [] })
    expect(allowlist.isAllowed('lucid_hedge')).toBe(true)
  })

  it('is allowed when no policy config at all (backwards compat)', () => {
    const allowlist = new CommandsAllowlist(null)
    expect(allowlist.isAllowed('lucid_hedge')).toBe(true)
  })

  it('is a trading tool but NOT elevated', () => {
    const allowlist = new CommandsAllowlist(null)
    expect(allowlist.isTradingTool('lucid_hedge')).toBe(true)
    expect(allowlist.isElevatedTradingTool('lucid_hedge')).toBe(false)
  })

  // ── BuiltInToolExecutor ──

  it('is recognized by BuiltInToolExecutor', () => {
    expect(isBuiltInTool('lucid_hedge')).toBe(true)
    expect(BUILT_IN_TOOL_NAMES.has('lucid_hedge')).toBe(true)
  })

  // ── Module exports ──

  it('tools module exports the handler', async () => {
    const mod = await import('../tools/hedge.js')
    expect(typeof mod.toolLucidHedge).toBe('function')
  })
})
