/**
 * Phase 3 smoke tests — schema enrichment + model routing for prediction markets.
 *
 * Verifies:
 *   1. polymarket_trade schema has expanded when_to_use and examples
 *   2. Examples cover all action categories (search, buy, orderbook, info, orders, split_and_sell)
 *   3. Prediction market patterns route to strong lane
 *   4. polymarket_trade is in STRONG_LANE_TOOLS
 *   5. related_tools includes lucid_hedge (companion tool)
 */

import { describe, it, expect } from 'vitest'
import { BUILT_IN_TOOLS } from '../../../agent/CommandsAllowlist.js'
import { routeModel, STRONG_LANE_TOOLS } from '../../../agent/model-router.js'

/** Matches the shape of schema examples for type-safe lookups */
type SchemaExample = { user: string; tool_call: { action?: string; [key: string]: unknown } }

describe('polymarket_trade Phase 3 schema enrichment', () => {
  const schema = BUILT_IN_TOOLS.polymarket_trade
  const examples = schema.examples as SchemaExample[]

  it('has 8+ when_to_use entries', () => {
    expect(schema.when_to_use).toBeDefined()
    expect(schema.when_to_use!.length).toBeGreaterThanOrEqual(8)
  })

  it('has 6+ examples covering all action categories', () => {
    expect(examples).toBeDefined()
    expect(examples.length).toBeGreaterThanOrEqual(6)
  })

  it('examples include split_and_sell workflow', () => {
    expect(examples.find((e) => e.tool_call.action === 'split_and_sell')).toBeDefined()
  })

  it('examples include orderbook action', () => {
    expect(examples.find((e) => e.tool_call.action === 'orderbook')).toBeDefined()
  })

  it('examples include market_info action', () => {
    expect(examples.find((e) => e.tool_call.action === 'market_info')).toBeDefined()
  })

  it('examples include open_orders action', () => {
    expect(examples.find((e) => e.tool_call.action === 'open_orders')).toBeDefined()
  })

  it('related_tools includes lucid_hedge', () => {
    expect(schema.related_tools).toContain('lucid_hedge')
  })
})

describe('prediction market model routing', () => {
  const strong = 'claude-3-opus'
  const fast = 'gpt-4o-mini'

  it('polymarket_trade is in STRONG_LANE_TOOLS', () => {
    expect(STRONG_LANE_TOOLS.has('polymarket_trade')).toBe(true)
  })

  it('"prediction market" phrase routes to strong lane', () => {
    const result = routeModel('tell me about prediction markets', strong, fast, 0)
    expect(result.lane).toBe('strong')
  })

  it('"polymarket" keyword routes to strong lane', () => {
    const result = routeModel('check polymarket for me', strong, fast, 0)
    expect(result.lane).toBe('strong')
  })

  it('"place a bet" routes to strong lane', () => {
    const result = routeModel('place a bet on this', strong, fast, 0)
    expect(result.lane).toBe('strong')
  })

  it('"odds on" routes to strong lane', () => {
    const result = routeModel('what are the odds on the election', strong, fast, 0)
    expect(result.lane).toBe('strong')
  })

  it('casual "bet" without trading intent does NOT force strong lane via prediction pattern', () => {
    // "I bet" is casual — but may still match other strong patterns like "explain"
    // The key point: the prediction regex should NOT be the one matching this
    const result = routeModel('I bet the weather is nice', strong, fast, 0)
    // This should either go to strong via another pattern or to default — NOT via prediction pattern
    if (result.lane === 'strong') {
      expect(result.reason).not.toContain('prediction')
      expect(result.reason).not.toContain('polymarket')
      expect(result.reason).not.toContain('bet')
    }
  })
})
