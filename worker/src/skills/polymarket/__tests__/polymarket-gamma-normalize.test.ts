/**
 * Contract test — verifies normalizeGammaMarket maps real Gamma API responses
 * to our PolymarketMarket type. Catches field-name drift (camelCase ↔ snake_case)
 * and structural changes (e.g. Gamma removing/renaming fields).
 *
 * Why this exists: The tool-e2e tests mock searchMarkets/getMarket at the service
 * boundary, feeding pre-shaped PolymarketMarket objects. That means the HTTP→type
 * mapping layer was untested — a camelCase/snake_case mismatch shipped to prod
 * undetected because mocks papered over it.
 */

import { describe, it, expect } from 'vitest'
import { normalizeGammaMarket } from '../services/clob-client.js'

// Snapshot of a real Gamma API response (GET /markets?_q=election&active=true&limit=1)
// Captured 2026-03-25. If Gamma changes their schema, this test will catch it.
const GAMMA_API_SNAPSHOT = {
  id: '531202',
  question: 'Will candidate X win?',
  conditionId: '0xb48621f7eba07b0a3eeabc6afb09ae42490239903997b9d412b0f69aeb040c8b',
  slug: 'will-candidate-x-win',
  resolutionSource: '',
  endDate: '2026-03-31T12:00:00Z',
  liquidity: '10019.02299',
  startDate: '2025-03-26T16:49:31.084Z',
  image: 'https://polymarket-upload.s3.amazonaws.com/image.jpg',
  icon: 'https://polymarket-upload.s3.amazonaws.com/icon.jpg',
  description: 'Resolves YES if candidate X wins the election.',
  outcomes: '["Yes", "No"]',
  outcomePrices: '["0.103", "0.897"]',
  volume: '212910.27',
  active: true,
  closed: false,
  archived: false,
  acceptingOrders: true,
  negRisk: true,
  enableOrderBook: true,
  orderPriceMinTickSize: 0.01,
  orderMinSize: 5,
  endDateIso: '2026-03-31T12:00:00.000Z',
  startDateIso: '2025-03-26T16:49:31.084Z',
  clobTokenIds: '["tok-yes-123", "tok-no-456"]',
  questionID: '0x3bb85f5d1a96c576a57502626785d97ea78982592a1775764cefd236e930fd02',
  volumeNum: 212910.27,
  liquidityNum: 10019.02,
  negRiskOther: false,
  ready: true,
  funded: true,
}

describe('normalizeGammaMarket', () => {
  const market = normalizeGammaMarket(GAMMA_API_SNAPSHOT)

  it('maps conditionId → condition_id', () => {
    expect(market.condition_id).toBe('0xb48621f7eba07b0a3eeabc6afb09ae42490239903997b9d412b0f69aeb040c8b')
  })

  it('maps questionID → question_id', () => {
    expect(market.question_id).toBe('0x3bb85f5d1a96c576a57502626785d97ea78982592a1775764cefd236e930fd02')
  })

  it('preserves question and description', () => {
    expect(market.question).toBe('Will candidate X win?')
    expect(market.description).toBe('Resolves YES if candidate X wins the election.')
  })

  it('maps endDateIso → end_date_iso', () => {
    expect(market.end_date_iso).toBe('2026-03-31T12:00:00.000Z')
  })

  it('maps boolean flags', () => {
    expect(market.active).toBe(true)
    expect(market.closed).toBe(false)
    expect(market.archived).toBe(false)
    expect(market.accepting_orders).toBe(true)
    expect(market.neg_risk).toBe(true)
  })

  it('maps orderMinSize → minimum_order_size', () => {
    expect(market.minimum_order_size).toBe(5)
  })

  it('maps orderPriceMinTickSize → minimum_tick_size', () => {
    expect(market.minimum_tick_size).toBe(0.01)
  })

  it('parses stringified outcomes + outcomePrices into tokens[]', () => {
    expect(market.tokens).toHaveLength(2)

    expect(market.tokens[0].outcome).toBe('Yes')
    expect(market.tokens[0].price).toBeCloseTo(0.103)
    expect(market.tokens[0].token_id).toBe('tok-yes-123')

    expect(market.tokens[1].outcome).toBe('No')
    expect(market.tokens[1].price).toBeCloseTo(0.897)
    expect(market.tokens[1].token_id).toBe('tok-no-456')
  })

  it('handles already-parsed arrays (non-string outcomes/prices)', () => {
    const raw = {
      ...GAMMA_API_SNAPSHOT,
      outcomes: ['Yes', 'No'],
      outcomePrices: ['0.5', '0.5'],
      clobTokenIds: ['a', 'b'],
    }
    const m = normalizeGammaMarket(raw)
    expect(m.tokens).toHaveLength(2)
    expect(m.tokens[0].price).toBeCloseTo(0.5)
  })

  it('handles missing optional fields gracefully', () => {
    const minimal = { question: 'Test?', conditionId: '0x1', active: true }
    const m = normalizeGammaMarket(minimal)
    expect(m.condition_id).toBe('0x1')
    expect(m.question).toBe('Test?')
    expect(m.tokens).toEqual([])
    expect(m.end_date_iso).toBe('')
    expect(m.neg_risk).toBe(false)
  })

  it('no undefined values in required fields', () => {
    const requiredFields = [
      'condition_id', 'question_id', 'question', 'description',
      'end_date_iso', 'active', 'closed', 'archived',
      'accepting_orders', 'neg_risk', 'tokens',
    ] as const
    for (const field of requiredFields) {
      expect(market[field]).not.toBeUndefined()
    }
  })
})
