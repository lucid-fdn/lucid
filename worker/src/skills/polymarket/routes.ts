/**
 * Polymarket REST endpoints for the dashboard.
 *
 * Exposes read-only data (positions, orders, orderbook), cancel action,
 * and bridge/funding endpoints (deposit address, withdrawal).
 * Auth: WORKER_TRIGGER_SECRET bearer token (same as /stream, /trigger).
 */

import type { Request, Response } from 'express'
import {
  getOpenOrders,
  getMarket,
  searchMarkets,
  getOrderbook,
  cancelOrder,
} from './services/index.js'
import type { ClobOpenOrder, PolymarketMarket } from './services/types.js'
import { POLYMARKET_BRIDGE_URL, SOLANA_USDC_MINT } from './services/constants.js'
import { createSupabaseClient } from '../../adapters/supabase.js'
import { redact } from '../../utils/pii-redactor.js'

interface BridgeDepositAddresses {
  evm: string
  svm: string
  btc: string
  tvm?: string
  note: string
}

// Deposit addresses are stable per wallet — safe to cache indefinitely
const depositAddressCache = new Map<string, BridgeDepositAddresses>()

/**
 * Register Polymarket routes on an Express app.
 * Called from index.ts: `registerPolymarketRoutes(app, '/polymarket')`
 */
export function registerPolymarketRoutes(
  app: { get: Function; post: Function; delete: Function },
  prefix: string,
): void {
  /**
   * GET /polymarket/positions?assistant_id=xxx
   */
  app.get(`${prefix}/positions`, async (req: Request, res: Response) => {
    const assistantId = req.query.assistant_id as string
    if (!assistantId) {
      return res.status(400).json({ error: 'assistant_id required' })
    }

    try {
      const orders = await getOpenOrders(assistantId)

      // Enrich with market questions (deduplicate by market condition_id)
      const marketIds = [...new Set(orders.map((o) => o.market))]
      const marketMap = new Map<string, PolymarketMarket>()

      await Promise.all(
        marketIds.map(async (cid) => {
          const m = await getMarket(cid)
          if (m) marketMap.set(cid, m)
        }),
      )

      const openOrders = orders.map((o: ClobOpenOrder) => ({
        id: o.id,
        status: o.status,
        market: o.market,
        assetId: o.asset_id,
        side: o.side,
        originalSize: o.original_size,
        sizeMatched: o.size_matched,
        price: o.price,
        createdAt: o.created_at,
        expiration: o.expiration,
        orderType: o.order_type,
        question: marketMap.get(o.market)?.question ?? null,
      }))

      const positions = buildPositionsFromOrders(orders, marketMap)

      return res.json({ positions, openOrders })
    } catch (error) {
      console.error('[Polymarket] /positions error:', error)
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch positions',
      })
    }
  })

  /**
   * GET /polymarket/search?q=xxx&limit=10
   */
  app.get(`${prefix}/search`, async (req: Request, res: Response) => {
    const query = req.query.q as string
    if (!query) {
      return res.status(400).json({ error: 'q required' })
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20)

    try {
      const markets = await searchMarkets(query, limit)
      const mapped = markets.map(mapMarket)
      return res.json({ markets: mapped })
    } catch (error) {
      console.error('[Polymarket] /search error:', error)
      return res.status(500).json({ error: 'Search failed' })
    }
  })

  /**
   * GET /polymarket/orderbook?condition_id=xxx&assistant_id=xxx
   */
  app.get(`${prefix}/orderbook`, async (req: Request, res: Response) => {
    const conditionId = req.query.condition_id as string
    const assistantId = req.query.assistant_id as string
    if (!conditionId || !assistantId) {
      return res.status(400).json({ error: 'condition_id and assistant_id required' })
    }

    try {
      const market = await getMarket(conditionId)
      if (!market) {
        return res.status(404).json({ error: 'Market not found' })
      }

      const yesToken = market.tokens.find((t) => t.outcome === 'Yes')
      if (!yesToken) {
        return res.status(404).json({ error: 'Yes token not found' })
      }

      const ob = await getOrderbook(yesToken.token_id, assistantId)
      if (!ob) {
        return res.json({ bids: [], asks: [], spread: '0', midPrice: null })
      }

      const bestBid = ob.bids[0] ? parseFloat(ob.bids[0].price) : null
      const bestAsk = ob.asks[0] ? parseFloat(ob.asks[0].price) : null
      const spread = bestBid != null && bestAsk != null
        ? (bestAsk - bestBid).toFixed(4)
        : '0'
      const midPrice = bestBid != null && bestAsk != null
        ? (bestBid + bestAsk) / 2
        : null

      return res.json({ bids: ob.bids, asks: ob.asks, spread, midPrice })
    } catch (error) {
      console.error('[Polymarket] /orderbook error:', error)
      return res.status(500).json({ error: 'Failed to fetch orderbook' })
    }
  })

  /**
   * DELETE /polymarket/orders/:orderId?assistant_id=xxx
   */
  app.delete(`${prefix}/orders/:orderId`, async (req: Request, res: Response) => {
    const { orderId } = req.params
    const assistantId = req.query.assistant_id as string
    if (!assistantId) {
      return res.status(400).json({ error: 'assistant_id required' })
    }

    try {
      const result = await cancelOrder(assistantId, orderId)
      return res.json(result)
    } catch (error) {
      console.error('[Polymarket] /orders cancel error:', error)
      return res.status(500).json({ success: false, error: 'Cancel failed' })
    }
  })

  /**
   * GET /polymarket/funding?assistant_id=xxx
   *
   * Returns deposit addresses for funding an agent's Polymarket account.
   * Fetches the agent's EVM wallet from DB, then calls Bridge API.
   */
  app.get(`${prefix}/funding`, async (req: Request, res: Response) => {
    const assistantId = req.query.assistant_id as string
    if (!assistantId) {
      return res.status(400).json({ error: 'assistant_id required' })
    }

    try {
      const walletAddress = await getAgentEvmWallet(assistantId)
      if (!walletAddress) {
        return res.status(404).json({ error: 'No active EVM wallet for this agent' })
      }

      // Check cache first
      const cached = depositAddressCache.get(walletAddress)
      if (cached) {
        return res.json({
          funding: {
            solanaDepositAddress: cached.svm,
            evmDepositAddress: cached.evm,
            btcDepositAddress: cached.btc,
            polygonWallet: walletAddress,
            note: cached.note,
          },
        })
      }

      // Call Bridge API
      const bridgeRes = await fetch(`${POLYMARKET_BRIDGE_URL}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      })

      if (!bridgeRes.ok) {
        const body = await bridgeRes.json().catch(() => ({}))
        console.error('[Polymarket] Bridge API error:', body)
        return res.status(502).json({
          error: (body as { error?: string }).error || `Bridge API HTTP ${bridgeRes.status}`,
        })
      }

      const data = (await bridgeRes.json()) as {
        address: { evm: string; svm: string; btc: string; tvm?: string }
        note: string
      }

      // Cache the result (deposit addresses are stable per wallet)
      depositAddressCache.set(walletAddress, { ...data.address, note: data.note })

      return res.json({
        funding: {
          solanaDepositAddress: data.address.svm,
          evmDepositAddress: data.address.evm,
          btcDepositAddress: data.address.btc,
          polygonWallet: walletAddress,
          note: data.note,
        },
      })
    } catch (error) {
      console.error('[Polymarket] /funding error:', redact(error instanceof Error ? error.message : String(error)))
      return res.status(500).json({ error: 'Failed to get deposit addresses' })
    }
  })

  /**
   * POST /polymarket/withdraw
   * Body: { assistant_id, recipient_address, amount }
   *
   * Initiates a withdrawal from Polymarket to a Solana address.
   */
  app.post(`${prefix}/withdraw`, async (req: Request, res: Response) => {
    const { assistant_id, recipient_address, amount } = (req.body || {}) as Record<string, string>
    if (!assistant_id || !recipient_address || !amount) {
      return res.status(400).json({ error: 'assistant_id, recipient_address, and amount required' })
    }

    try {
      const walletAddress = await getAgentEvmWallet(assistant_id)
      if (!walletAddress) {
        return res.status(404).json({ error: 'No active EVM wallet for this agent' })
      }

      const bridgeRes = await fetch(`${POLYMARKET_BRIDGE_URL}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: walletAddress,
          toChainId: 'solana',
          toTokenAddress: SOLANA_USDC_MINT,
          recipientAddr: recipient_address,
        }),
      })

      if (!bridgeRes.ok) {
        const body = await bridgeRes.json().catch(() => ({}))
        console.error('[Polymarket] Bridge withdrawal error:', body)
        return res.status(502).json({
          error: (body as { error?: string }).error || `Bridge API HTTP ${bridgeRes.status}`,
        })
      }

      const data = (await bridgeRes.json()) as {
        evm: string
        svm: string
        btc: string
        note: string
      }

      return res.json({
        success: true,
        withdrawAddress: data.evm,
        note: data.note,
      })
    } catch (error) {
      console.error('[Polymarket] /withdraw error:', error)
      return res.status(500).json({ success: false, error: 'Withdrawal failed' })
    }
  })
}

// ── Helpers ──

/**
 * Get an agent's active EVM wallet address from the database.
 */
async function getAgentEvmWallet(assistantId: string): Promise<string | null> {
  const supabase = createSupabaseClient()
  const { data } = await supabase
    .from('agent_wallets')
    .select('address')
    .eq('assistant_id', assistantId)
    .eq('chain_type', 'ethereum')
    .eq('status', 'active')
    .single()

  return data?.address ?? null
}

function mapMarket(m: PolymarketMarket) {
  const yes = m.tokens.find((t) => t.outcome === 'Yes')
  const no = m.tokens.find((t) => t.outcome === 'No')
  return {
    conditionId: m.condition_id,
    questionId: m.question_id,
    question: m.question,
    description: m.description,
    endDate: m.end_date_iso,
    active: m.active,
    closed: m.closed,
    acceptingOrders: m.accepting_orders,
    negRisk: m.neg_risk,
    minOrderSize: m.minimum_order_size,
    yesPrice: yes?.price ?? 0,
    noPrice: no?.price ?? 0,
    yesTokenId: yes?.token_id ?? '',
    noTokenId: no?.token_id ?? '',
  }
}

function buildPositionsFromOrders(
  orders: ClobOpenOrder[],
  marketMap: Map<string, PolymarketMarket>,
) {
  const matched = orders.filter((o) => parseFloat(o.size_matched) > 0)
  const grouped = new Map<string, { order: ClobOpenOrder; market: PolymarketMarket | undefined }>()

  for (const order of matched) {
    const key = `${order.market}:${order.asset_id}`
    if (!grouped.has(key)) {
      grouped.set(key, { order, market: marketMap.get(order.market) })
    }
  }

  return Array.from(grouped.values())
    .filter((g) => g.market != null)
    .map((g) => {
      const { order, market } = g
      const token = market!.tokens.find((t) => t.token_id === order.asset_id)
      const currentPrice = token?.price ?? 0
      const entryPrice = parseFloat(order.price)
      const size = parseFloat(order.size_matched)
      const pnlUsd = (currentPrice - entryPrice) * size
      const pnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0

      return {
        conditionId: order.market,
        question: market!.question,
        outcome: token?.outcome ?? 'Yes',
        tokenId: order.asset_id,
        size: order.size_matched,
        avgEntryPrice: entryPrice,
        currentPrice,
        pnlUsd,
        pnlPercent,
        marketActive: market!.active,
      }
    })
}
