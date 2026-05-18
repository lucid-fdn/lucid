/**
 * Polymarket Bridge — constants, worker endpoint logic, and integration tests.
 *
 * Tests the funding rail: deposit address generation, withdrawal, caching,
 * wallet lookup, and Bridge API integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  POLYMARKET_BRIDGE_URL,
  SOLANA_USDC_MINT,
} from '../services/constants.js'

// ── Constants Tests ──

describe('Bridge constants', () => {
  it('POLYMARKET_BRIDGE_URL is HTTPS', () => {
    expect(POLYMARKET_BRIDGE_URL).toMatch(/^https:\/\//)
    expect(POLYMARKET_BRIDGE_URL).toBe('https://bridge.polymarket.com')
  })

  it('SOLANA_USDC_MINT is a valid Solana base58 address', () => {
    expect(SOLANA_USDC_MINT).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    // Solana addresses are 32-44 chars base58
    expect(SOLANA_USDC_MINT).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  })
})

// ── Worker Route Tests ──

describe('Polymarket funding routes', () => {
  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetAllMocks()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // Helper to create mock Express req/res
  function createMockReq(query: Record<string, string> = {}, body?: unknown, params?: Record<string, string>) {
    return {
      query,
      body,
      params: params || {},
    } as any
  }

  function createMockRes() {
    const res: any = {
      statusCode: 200,
      jsonData: null,
    }
    res.status = vi.fn((code: number) => {
      res.statusCode = code
      return res
    })
    res.json = vi.fn((data: unknown) => {
      res.jsonData = data
      return res
    })
    return res
  }

  // Mock supabase for wallet lookup — chainable builder pattern
  // Shared ref object so mutations propagate into the hoisted mock closure
  const walletRef = { result: { data: null as any, error: null as any } }

  vi.mock('../../../adapters/supabase.js', async () => {
    // Access the shared ref via closure
    const ref = (globalThis as any).__polymarketTestWalletRef
    return {
      createSupabaseClient: () => ({
        from: () => {
          const chain: any = {}
          chain.select = () => chain
          chain.eq = () => chain
          chain.single = () => Promise.resolve(ref.result)
          return chain
        },
      }),
    }
  })

  // Expose ref on globalThis so the hoisted mock can access it
  ;(globalThis as any).__polymarketTestWalletRef = walletRef

  // Mock polymarket service (already required by the routes file)
  vi.mock('../services/index.js', () => ({
    getOpenOrders: vi.fn().mockResolvedValue([]),
    getMarket: vi.fn().mockResolvedValue(null),
    searchMarkets: vi.fn().mockResolvedValue([]),
    getOrderbook: vi.fn().mockResolvedValue(null),
    cancelOrder: vi.fn().mockResolvedValue({ success: true }),
  }))

  // Capture registered route handlers
  let routeHandlers: Record<string, Function> = {}

  beforeEach(async () => {
    routeHandlers = {}
    const mockApp = {
      get: vi.fn((path: string, handler: Function) => {
        routeHandlers[`GET ${path}`] = handler
      }),
      post: vi.fn((path: string, handler: Function) => {
        routeHandlers[`POST ${path}`] = handler
      }),
      delete: vi.fn((path: string, handler: Function) => {
        routeHandlers[`DELETE ${path}`] = handler
      }),
    }

    const { registerPolymarketRoutes } = await import('../routes.js')
    registerPolymarketRoutes(mockApp, '/polymarket')
  })

  describe('route registration', () => {
    it('registers GET /polymarket/funding', () => {
      expect(routeHandlers['GET /polymarket/funding']).toBeDefined()
    })

    it('registers POST /polymarket/withdraw', () => {
      expect(routeHandlers['POST /polymarket/withdraw']).toBeDefined()
    })

    it('registers all 6 routes (4 existing + 2 new)', () => {
      const routes = Object.keys(routeHandlers)
      expect(routes).toContain('GET /polymarket/positions')
      expect(routes).toContain('GET /polymarket/search')
      expect(routes).toContain('GET /polymarket/orderbook')
      expect(routes).toContain('DELETE /polymarket/orders/:orderId')
      expect(routes).toContain('GET /polymarket/funding')
      expect(routes).toContain('POST /polymarket/withdraw')
    })
  })

  describe('GET /polymarket/funding', () => {
    const handler = () => routeHandlers['GET /polymarket/funding']

    it('returns 400 if assistant_id missing', async () => {
      const req = createMockReq({})
      const res = createMockRes()
      await handler()(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.jsonData).toEqual({ error: 'assistant_id required' })
    })

    it('returns 404 if no active EVM wallet', async () => {
      walletRef.result = ({ data: null, error: null })
      const req = createMockReq({ assistant_id: 'ast-123' })
      const res = createMockRes()
      await handler()(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.jsonData.error).toContain('No active EVM wallet')
    })

    it('calls Bridge API with wallet address and returns deposit addresses', async () => {
      const walletAddr = '0x1234567890abcdef1234567890abcdef12345678'
      walletRef.result = ({
        data: { address: walletAddr },
        error: null,
      })

      const bridgeResponse = {
        address: {
          evm: '0xevm-deposit-addr',
          svm: 'SoLaNavmDepoSitAddress123456789',
          btc: 'bc1qbitcoinaddress',
        },
        note: 'Only certain tokens supported',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(bridgeResponse),
      })

      const req = createMockReq({ assistant_id: 'ast-123' })
      const res = createMockRes()
      await handler()(req, res)

      // Verify Bridge API was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        `${POLYMARKET_BRIDGE_URL}/deposit`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: walletAddr }),
        }),
      )

      // Verify response shape
      expect(res.jsonData.funding).toEqual({
        solanaDepositAddress: 'SoLaNavmDepoSitAddress123456789',
        evmDepositAddress: '0xevm-deposit-addr',
        btcDepositAddress: 'bc1qbitcoinaddress',
        polygonWallet: walletAddr,
        note: 'Only certain tokens supported',
      })
    })

    it('caches deposit addresses on second call', async () => {
      const walletAddr = '0xCACHE_TEST_1234567890abcdef1234567890'
      walletRef.result = ({
        data: { address: walletAddr },
        error: null,
      })

      const bridgeResponse = {
        address: { evm: '0xevm', svm: 'svm-addr', btc: 'btc-addr' },
        note: 'test',
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(bridgeResponse),
      })

      // First call - hits Bridge API
      const req1 = createMockReq({ assistant_id: 'ast-cache' })
      const res1 = createMockRes()
      await handler()(req1, res1)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      mockFetch.mockClear()
      const req2 = createMockReq({ assistant_id: 'ast-cache' })
      const res2 = createMockRes()
      await handler()(req2, res2)
      expect(mockFetch).not.toHaveBeenCalled()
      expect(res2.jsonData.funding.solanaDepositAddress).toBe('svm-addr')
    })

    it('returns 502 on Bridge API failure', async () => {
      walletRef.result = ({
        data: { address: '0xBRIDGE_FAIL_1234567890abcdef12345678' },
        error: null,
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Bridge down' }),
      })

      const req = createMockReq({ assistant_id: 'ast-fail' })
      const res = createMockRes()
      await handler()(req, res)
      expect(res.status).toHaveBeenCalledWith(502)
      expect(res.jsonData.error).toBe('Bridge down')
    })
  })

  describe('POST /polymarket/withdraw', () => {
    const handler = () => routeHandlers['POST /polymarket/withdraw']

    it('returns 400 if required fields missing', async () => {
      const testCases = [
        {},
        { assistant_id: 'x' },
        { assistant_id: 'x', recipient_address: 'y' },
        { assistant_id: 'x', amount: '100' },
      ]

      for (const body of testCases) {
        const req = createMockReq({}, body)
        const res = createMockRes()
        await handler()(req, res)
        expect(res.status).toHaveBeenCalledWith(400)
      }
    })

    it('returns 404 if no active EVM wallet', async () => {
      walletRef.result = ({ data: null, error: null })
      const req = createMockReq({}, {
        assistant_id: 'ast-123',
        recipient_address: 'SoLaNaAddr123',
        amount: '100',
      })
      const res = createMockRes()
      await handler()(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('calls Bridge withdrawal API with correct params', async () => {
      const walletAddr = '0xWITHDRAW_TEST_abcdef1234567890abcdef'
      walletRef.result = ({
        data: { address: walletAddr },
        error: null,
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          evm: '0xwithdraw-addr',
          svm: 'svm-withdraw-addr',
          btc: 'btc-withdraw-addr',
          note: 'Send USDC.e here',
        }),
      })

      const req = createMockReq({}, {
        assistant_id: 'ast-w',
        recipient_address: 'SoLaNaRecipient123',
        amount: '50.00',
      })
      const res = createMockRes()
      await handler()(req, res)

      // Verify Bridge API called with SOLANA_USDC_MINT
      expect(mockFetch).toHaveBeenCalledWith(
        `${POLYMARKET_BRIDGE_URL}/withdraw`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            address: walletAddr,
            toChainId: 'solana',
            toTokenAddress: SOLANA_USDC_MINT,
            recipientAddr: 'SoLaNaRecipient123',
          }),
        }),
      )

      expect(res.jsonData).toEqual({
        success: true,
        withdrawAddress: '0xwithdraw-addr',
        note: 'Send USDC.e here',
      })
    })

    it('returns 502 on Bridge API failure', async () => {
      walletRef.result = ({
        data: { address: '0xWITHDRAW_FAIL_abcdef1234567890abcdef' },
        error: null,
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid recipient' }),
      })

      const req = createMockReq({}, {
        assistant_id: 'ast-wf',
        recipient_address: 'bad',
        amount: '50',
      })
      const res = createMockRes()
      await handler()(req, res)
      expect(res.status).toHaveBeenCalledWith(502)
      expect(res.jsonData.error).toBe('Invalid recipient')
    })
  })
})
