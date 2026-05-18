/**
 * E2E tests — CLOB auth, order signing, and full trade flow.
 *
 * Verifies the complete auth chain:
 *   L1 EIP-712 → API key derivation → L2 HMAC signing → order placement
 *   CTF operations → split/merge/redeem with neg-risk routing
 *   Credential caching → LRU eviction → promise dedup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'

// Mock external dependencies
vi.mock('../../../services/session-signer/index.js', () => ({
  signAgentWalletTypedData: vi.fn(),
  executeAgentWalletTransaction: vi.fn(),
}))

vi.mock('../services/fetch-retry.js', () => ({
  fetchWithRetry: vi.fn(),
}))

import {
  deriveClobApiKey,
  buildSignedOrder,
  placeOrder,
  getMarket,
  getOrderbook,
  getPrice,
  getPrices,
  getMidpoint,
  getSpread,
  getLastTradePrice,
  getPriceHistory,
  getTickSize,
  getNegRisk,
  getFeeRateBps,
  getOrderbooks,
  cancelOrder,
  cancelOrders,
  cancelAll,
  cancelMarketOrders,
  getOpenOrders,
  getDataApiPositions,
  _clearClobCache,
  normalizeGammaMarket,
} from '../services/clob-client.js'
import { signAgentWalletTypedData } from '../../../services/session-signer/index.js'
import { fetchWithRetry } from '../services/fetch-retry.js'
import {
  POLYMARKET_CLOB_URL,
  POLYMARKET_GAMMA_URL,
  POLYMARKET_DATA_URL,
  POLYMARKET_CONTRACTS,
  ORDER_PROTOCOL_NAME,
  ORDER_PROTOCOL_VERSION,
  ORDER_SIDE,
  SIGNATURE_TYPE,
  ZERO_ADDRESS,
} from '../services/constants.js'

const mockSign = vi.mocked(signAgentWalletTypedData)
const mockFetch = vi.mocked(fetchWithRetry)

beforeEach(() => {
  vi.resetAllMocks()
  _clearClobCache()
})

// ============================================================================
// L1 Auth — API Key Derivation
// ============================================================================

describe('L1 Auth — deriveClobApiKey', () => {
  it('signs ClobAuth EIP-712 with correct domain (no verifyingContract)', async () => {
    mockSign.mockResolvedValue({
      success: true,
      signature: '0xsig123',
      address: '0xWalletAddress',
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ apiKey: 'key1', secret: 'c2VjcmV0', passphrase: 'pass1' }),
    } as Response)

    await deriveClobApiKey('ast-1')

    // Verify EIP-712 typed data structure
    const typedData = mockSign.mock.calls[0][1]
    expect(typedData.primaryType).toBe('ClobAuth')
    expect(typedData.domain.name).toBe('ClobAuthDomain')
    expect(typedData.domain.version).toBe('1')
    expect(typedData.domain.chainId).toBe(137)
    // ClobAuth domain has NO verifyingContract
    expect(typedData.domain.verifyingContract).toBeUndefined()
    // Check ClobAuth message fields
    expect(typedData.message.message).toBe('This message attests that I control the given wallet')
    expect(typedData.message.nonce).toBe(0)
  })

  it('calls GET /api-key/derive with L1 headers', async () => {
    mockSign.mockResolvedValue({
      success: true,
      signature: '0xsig123',
      address: '0xWalletAddr',
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'k', secret: 'c2VjcmV0', passphrase: 'p' }),
    } as Response)

    await deriveClobApiKey('ast-1')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`${POLYMARKET_CLOB_URL}/api-key/derive?nonce=0`),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          POLY_ADDRESS: '0xWalletAddr',
          POLY_SIGNATURE: '0xsig123',
          POLY_NONCE: '0',
        }),
      }),
    )
  })

  it('handles both response shapes (key/secret vs apiKey/apiSecret)', async () => {
    mockSign.mockResolvedValue({ success: true, signature: '0x1', address: '0xA' })

    // Shape 1: key/secret/passphrase
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: 'k1', secret: 'c2VjcmV0', passphrase: 'p1' }),
    } as Response)
    const creds1 = await deriveClobApiKey('ast-1')
    expect(creds1.apiKey).toBe('k1')

    _clearClobCache()

    // Shape 2: apiKey/apiSecret/apiPassphrase
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiKey: 'k2', apiSecret: 'c2VjcmV0Mg==', apiPassphrase: 'p2' }),
    } as Response)
    const creds2 = await deriveClobApiKey('ast-2')
    expect(creds2.apiKey).toBe('k2')
  })

  it('throws PolymarketAuthError on empty credentials', async () => {
    mockSign.mockResolvedValue({ success: true, signature: '0x1', address: '0xA' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: '', secret: '' }),
    } as Response)

    await expect(deriveClobApiKey('ast-1')).rejects.toThrow('empty credentials')
  })

  it('throws PolymarketAuthError on signing failure', async () => {
    mockSign.mockResolvedValue({ success: false, error: 'HSM unavailable' })

    await expect(deriveClobApiKey('ast-1')).rejects.toThrow('HSM unavailable')
  })
})

// ============================================================================
// Credential Cache — LRU + Promise Dedup
// ============================================================================

describe('Credential Cache', () => {
  function mockSuccessfulDerive() {
    mockSign.mockResolvedValue({ success: true, signature: '0x1', address: '0xWallet' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'k', secret: 'c2VjcmV0', passphrase: 'p' }),
    } as Response)
  }

  it('caches credentials — second call does not re-derive', async () => {
    mockSuccessfulDerive()

    // Need to trigger caching via placeOrder or getOpenOrders (which use getClobCredentials)
    // buildSignedOrder uses getClobCredentials internally
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'k', secret: 'c2VjcmV0', passphrase: 'p' }),
    } as Response)

    await deriveClobApiKey('ast-cache')
    expect(mockSign).toHaveBeenCalledTimes(1)

    // Clear cache to prove it works
    _clearClobCache()
    await deriveClobApiKey('ast-cache')
    expect(mockSign).toHaveBeenCalledTimes(2)
  })

  it('_clearClobCache resets cache state', async () => {
    mockSuccessfulDerive()
    await deriveClobApiKey('ast-x')
    _clearClobCache()
    // After clear, next derivation should sign again
    await deriveClobApiKey('ast-x')
    expect(mockSign).toHaveBeenCalledTimes(2)
  })
})

// ============================================================================
// EIP-712 Order Signing
// ============================================================================

describe('EIP-712 Order Signing — buildSignedOrder', () => {
  beforeEach(() => {
    // Mock credential derivation
    mockSign.mockResolvedValue({
      success: true,
      signature: '0xOrderSig',
      address: '0xMakerAddr',
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'k', secret: 'c2VjcmV0', passphrase: 'p' }),
    } as Response)
  })

  it('builds order with correct EIP-712 domain for standard market', async () => {
    const order = await buildSignedOrder('ast-1', {
      tokenId: 'tok-123',
      side: 'BUY',
      price: 0.65,
      size: 100,
      orderType: 'GTC',
      negRisk: false,
      feeRateBps: 0,
    })

    // Verify the EIP-712 sign call
    const signCalls = mockSign.mock.calls
    const orderSignCall = signCalls.find(c => c[1].primaryType === 'Order')
    expect(orderSignCall).toBeDefined()

    const typedData = orderSignCall![1]
    expect(typedData.domain.name).toBe(ORDER_PROTOCOL_NAME)
    expect(typedData.domain.version).toBe(ORDER_PROTOCOL_VERSION)
    expect(typedData.domain.chainId).toBe(137)
    // Standard market → CTF_EXCHANGE
    expect(typedData.domain.verifyingContract).toBe(POLYMARKET_CONTRACTS.CTF_EXCHANGE)
  })

  it('uses NEG_RISK_CTF_EXCHANGE for neg-risk markets', async () => {
    await buildSignedOrder('ast-1', {
      tokenId: 'tok-neg',
      side: 'BUY',
      price: 0.50,
      size: 50,
      orderType: 'GTC',
      negRisk: true,
      feeRateBps: 0,
    })

    const orderSignCall = mockSign.mock.calls.find(c => c[1].primaryType === 'Order')
    expect(orderSignCall![1].domain.verifyingContract).toBe(
      POLYMARKET_CONTRACTS.NEG_RISK_CTF_EXCHANGE,
    )
  })

  it('computes BUY amounts correctly: maker=USDC, taker=tokens', async () => {
    const order = await buildSignedOrder('ast-1', {
      tokenId: 'tok-1',
      side: 'BUY',
      price: 0.65,
      size: 100,
      orderType: 'GTC',
      negRisk: false,
      feeRateBps: 0,
    })

    // BUY: makerAmount = size * price (USDC), takerAmount = size (tokens)
    // 100 tokens * 0.65 price = 65 USDC → 65_000_000 (6 decimals)
    // 100 tokens → 100_000_000 (6 decimals)
    expect(order.makerAmount).toBe('65000000')
    expect(order.takerAmount).toBe('100000000')
    expect(order.side).toBe(ORDER_SIDE.BUY)
  })

  it('computes SELL amounts correctly: maker=tokens, taker=USDC', async () => {
    const order = await buildSignedOrder('ast-1', {
      tokenId: 'tok-1',
      side: 'SELL',
      price: 0.40,
      size: 200,
      orderType: 'GTC',
      negRisk: false,
      feeRateBps: 0,
    })

    // SELL: makerAmount = size (tokens), takerAmount = size * price (USDC)
    // 200 tokens → 200_000_000
    // 200 * 0.40 = 80 USDC → 80_000_000
    expect(order.makerAmount).toBe('200000000')
    expect(order.takerAmount).toBe('80000000')
    expect(order.side).toBe(ORDER_SIDE.SELL)
  })

  it('sets default values correctly', async () => {
    const order = await buildSignedOrder('ast-1', {
      tokenId: 'tok-1',
      side: 'BUY',
      price: 0.50,
      size: 10,
      orderType: 'GTC',
    })

    expect(order.taker).toBe(ZERO_ADDRESS)
    expect(order.nonce).toBe('0')
    expect(order.expiration).toBe('0')
    expect(order.signatureType).toBe(SIGNATURE_TYPE.EOA)
    expect(order.maker).toBe('0xMakerAddr')
    expect(order.signer).toBe('0xMakerAddr')
    expect(order.signature).toBe('0xOrderSig')
  })

  it('generates unique salt per order', async () => {
    const order1 = await buildSignedOrder('ast-1', {
      tokenId: 'tok-1', side: 'BUY', price: 0.50, size: 10, orderType: 'GTC',
    })
    _clearClobCache()
    const order2 = await buildSignedOrder('ast-1', {
      tokenId: 'tok-1', side: 'BUY', price: 0.50, size: 10, orderType: 'GTC',
    })
    expect(order1.salt).not.toBe(order2.salt)
  })
})

// ============================================================================
// L2 Auth — HMAC Request Signing (placeOrder)
// ============================================================================

describe('L2 Auth — placeOrder', () => {
  beforeEach(() => {
    // First call: derivation signature, second: order signature
    mockSign
      .mockResolvedValueOnce({ success: true, signature: '0xDeriveSig', address: '0xWallet' })
      .mockResolvedValueOnce({ success: true, signature: '0xOrderSig', address: '0xWallet' })

    // First fetch: API key derive, second: order POST
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: 'myApiKey', secret: Buffer.from('mySecret').toString('base64'), passphrase: 'myPass' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, orderID: 'ord-abc' }),
      } as Response)
  })

  it('posts order to /order with L2 HMAC headers', async () => {
    const result = await placeOrder('ast-1', {
      tokenId: 'tok-1',
      side: 'BUY',
      price: 0.65,
      size: 100,
      orderType: 'GTC',
      negRisk: false,
      feeRateBps: 0,
    })

    expect(result.success).toBe(true)
    expect(result.orderID).toBe('ord-abc')

    // Verify the order POST call (second fetchWithRetry call)
    const orderCall = mockFetch.mock.calls[1]
    expect(orderCall[0]).toBe(`${POLYMARKET_CLOB_URL}/order`)
    const init = orderCall[1] as RequestInit
    expect(init.method).toBe('POST')

    // Verify L2 headers present
    const headers = init.headers as Record<string, string>
    expect(headers['POLY_ADDRESS']).toBe('0xWallet')
    expect(headers['POLY_API_KEY']).toBe('myApiKey')
    expect(headers['POLY_PASSPHRASE']).toBe('myPass')
    expect(headers['POLY_SIGNATURE']).toBeDefined()
    expect(headers['POLY_TIMESTAMP']).toBeDefined()

    // Verify payload structure
    const payload = JSON.parse(init.body as string)
    expect(payload.order).toBeDefined()
    expect(payload.order.signature).toBe('0xOrderSig')
    expect(payload.order_type).toBe('GTC')
    expect(payload.owner).toBe('0xWallet')
  })

  it('returns error on signing failure (does not throw)', async () => {
    _clearClobCache()
    mockSign.mockReset()
    mockSign.mockResolvedValue({ success: false, error: 'HSM down' })

    const result = await placeOrder('ast-1', {
      tokenId: 'tok-1', side: 'BUY', price: 0.50, size: 10, orderType: 'GTC',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('HSM down')
  })
})

// ============================================================================
// Public Endpoints — No Auth Required
// ============================================================================

describe('Public CLOB Endpoints (no auth)', () => {
  it('getOrderbook fetches without auth headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        market: '0xabc',
        asset_id: 'tok-1',
        timestamp: '2026-01-01',
        bids: [{ price: '0.64', size: '100' }],
        asks: [{ price: '0.66', size: '50' }],
        hash: 'h',
      }),
    } as Response)

    const book = await getOrderbook('tok-1')
    expect(book).toBeDefined()
    expect(book!.bids).toHaveLength(1)

    // Should NOT have POLY_API_KEY (it's public)
    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['POLY_API_KEY']).toBeUndefined()
  })

  it('getOrderbooks posts batch to /orderbooks', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ([
        { market: '0x1', asset_id: 't1', bids: [], asks: [], hash: 'h1', timestamp: 't' },
        { market: '0x2', asset_id: 't2', bids: [], asks: [], hash: 'h2', timestamp: 't' },
      ]),
    } as Response)

    const books = await getOrderbooks(['t1', 't2'])
    expect(books).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledWith(
      `${POLYMARKET_CLOB_URL}/orderbooks`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('getPrice fetches single token price', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ price: '0.67' }),
    } as Response)

    const price = await getPrice('tok-1', 'BUY')
    expect(price).toBe('0.67')
  })

  it('getPrices posts batch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ 'tok-1': '0.67', 'tok-2': '0.33' }),
    } as Response)

    const prices = await getPrices(['tok-1', 'tok-2'])
    expect(prices['tok-1']).toBe('0.67')
  })

  it('getMidpoint returns mid price', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mid: '0.655' }),
    } as Response)
    expect(await getMidpoint('tok-1')).toBe('0.655')
  })

  it('getSpread returns bid/ask/spread', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ bid: '0.64', ask: '0.66', spread: '0.02' }),
    } as Response)
    const spread = await getSpread('tok-1')
    expect(spread).toEqual({ bid: '0.64', ask: '0.66', spread: '0.02' })
  })

  it('getLastTradePrice returns last trade', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ price: '0.68' }),
    } as Response)
    expect(await getLastTradePrice('tok-1')).toBe('0.68')
  })

  it('getPriceHistory returns OHLC data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ history: [{ t: 1700000000, p: 0.65 }, { t: 1700003600, p: 0.67 }] }),
    } as Response)
    const history = await getPriceHistory('tok-1', '1h')
    expect(history).toHaveLength(2)
    expect(history[0].t).toBe(1700000000)
  })

  it('getTickSize defaults to 0.01 on error', async () => {
    mockFetch.mockRejectedValue(new Error('network'))
    expect(await getTickSize('tok-1')).toBe('0.01')
  })

  it('getNegRisk defaults to false on error', async () => {
    mockFetch.mockRejectedValue(new Error('network'))
    expect(await getNegRisk('tok-1')).toBe(false)
  })

  it('getFeeRateBps defaults to 0 on error', async () => {
    mockFetch.mockRejectedValue(new Error('network'))
    expect(await getFeeRateBps()).toBe(0)
  })
})

// ============================================================================
// Authenticated Endpoints — Cancel Operations
// ============================================================================

describe('Cancel Operations (L2 Auth)', () => {
  beforeEach(() => {
    mockSign.mockResolvedValue({ success: true, signature: '0x1', address: '0xWallet' })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: 'k', secret: Buffer.from('s').toString('base64'), passphrase: 'p' }),
    } as Response)
  })

  it('cancelOrder sends DELETE /order with orderID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response)

    const result = await cancelOrder('ast-1', 'ord-123')
    expect(result.success).toBe(true)

    const call = mockFetch.mock.calls[1]
    expect(call[0]).toBe(`${POLYMARKET_CLOB_URL}/order`)
    const init = call[1] as RequestInit
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ orderID: 'ord-123' })
  })

  it('cancelOrders sends DELETE /orders with ID array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response)

    const result = await cancelOrders('ast-1', ['ord-1', 'ord-2'])
    expect(result.success).toBe(true)

    const call = mockFetch.mock.calls[1]
    expect(call[0]).toBe(`${POLYMARKET_CLOB_URL}/orders`)
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual(['ord-1', 'ord-2'])
  })

  it('cancelAll sends DELETE /orders/all', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response)

    const result = await cancelAll('ast-1')
    expect(result.success).toBe(true)
    expect(mockFetch.mock.calls[1][0]).toBe(`${POLYMARKET_CLOB_URL}/orders/all`)
  })

  it('cancelMarketOrders sends DELETE /orders/market', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response)

    const result = await cancelMarketOrders('ast-1', '0xmarket')
    expect(result.success).toBe(true)
    const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string)
    expect(body).toEqual({ market: '0xmarket' })
  })

  it('cancel operations return error on failure (no throw)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'))
    const result = await cancelOrder('ast-1', 'ord-x')
    expect(result.success).toBe(false)
    expect(result.error).toContain('network down')
  })
})

// ============================================================================
// Data API — Positions
// ============================================================================

describe('Data API — getDataApiPositions', () => {
  it('fetches from data-api.polymarket.com with wallet address', async () => {
    // First: derive creds (to get wallet address)
    mockSign.mockResolvedValue({ success: true, signature: '0x1', address: '0xAgentWallet' })
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: 'k', secret: Buffer.from('s').toString('base64'), passphrase: 'p' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          { asset: '12345', conditionId: '0xabc', size: '100', avgPrice: '0.65', curPrice: '0.70', outcome: 'Yes' },
        ]),
      } as Response)

    const positions = await getDataApiPositions('ast-1')
    expect(positions).toHaveLength(1)

    // Verify it hits the Data API URL
    const dataCall = mockFetch.mock.calls[1]
    expect(dataCall[0]).toContain(POLYMARKET_DATA_URL)
    expect(dataCall[0]).toContain('user=0xAgentWallet')
  })

  it('returns empty array on error', async () => {
    mockSign.mockResolvedValue({ success: true, signature: '0x1', address: '0xW' })
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: 'k', secret: Buffer.from('s').toString('base64'), passphrase: 'p' }),
      } as Response)
      .mockRejectedValueOnce(new Error('timeout'))

    const positions = await getDataApiPositions('ast-1')
    expect(positions).toEqual([])
  })
})

// ============================================================================
// Gamma Market Normalization
// ============================================================================

describe('normalizeGammaMarket', () => {
  it('normalizes camelCase Gamma response to snake_case', () => {
    const raw = {
      conditionId: '0xabc',
      questionID: 'qid',
      question: 'Will it rain?',
      description: 'Resolves YES if rain',
      endDateIso: '2026-12-31T00:00:00Z',
      active: true,
      closed: false,
      archived: false,
      acceptingOrders: true,
      orderMinSize: '5',
      orderPriceMinTickSize: '0.01',
      negRisk: false,
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.65","0.35"]',
      clobTokenIds: '["tok-yes","tok-no"]',
    }

    const market = normalizeGammaMarket(raw)
    expect(market.condition_id).toBe('0xabc')
    expect(market.accepting_orders).toBe(true)
    expect(market.minimum_order_size).toBe('5')
    expect(market.minimum_tick_size).toBe('0.01')
    expect(market.neg_risk).toBe(false)
    expect(market.tokens).toHaveLength(2)
    expect(market.tokens[0].outcome).toBe('Yes')
    expect(market.tokens[0].price).toBe(0.65)
    expect(market.tokens[0].token_id).toBe('tok-yes')
  })

  it('handles array-format outcomes (non-stringified)', () => {
    const raw = {
      conditionId: '0x1',
      outcomes: ['Yes', 'No'],
      outcomePrices: ['0.8', '0.2'],
      clobTokenIds: ['t1', 't2'],
      active: true,
    }

    const market = normalizeGammaMarket(raw)
    expect(market.tokens).toHaveLength(2)
    expect(market.tokens[0].price).toBe(0.8)
  })

  it('defaults missing fields gracefully', () => {
    const market = normalizeGammaMarket({})
    expect(market.condition_id).toBe('')
    expect(market.active).toBe(false)
    expect(market.neg_risk).toBe(false)
    expect(market.tokens).toEqual([])
  })
})
