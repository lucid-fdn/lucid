/**
 * Polymarket CLOB Client — REST client for order placement + market data.
 *
 * API: https://clob.polymarket.com
 * Auth:
 *   - L1: EIP-712 wallet signature for API key derivation
 *   - L2: HMAC-SHA256 per-request signing with derived API credentials
 *
 * Order signing: EIP-712 typed data matching @polymarket/order-utils
 * Uses signAgentWalletTypedData for all EIP-712 signing via Privy HSM.
 * Includes: LRU-bounded cache, promise dedup, retry with backoff, timeouts.
 */

import { createHmac, randomBytes } from 'node:crypto'
import { signAgentWalletTypedData } from '../../../services/session-signer/index.js'
import { fetchWithRetry } from './fetch-retry.js'
import { PolymarketAuthError, PolymarketValidationError } from './errors.js'
import {
  POLYMARKET_CLOB_URL,
  POLYMARKET_GAMMA_URL,
  POLYMARKET_DATA_URL,
  CLOB_API_KEY_TTL_MS,
  CLOB_API_KEY_CACHE_MAX,
  POLYMARKET_CONTRACTS,
  POLYGON_CHAIN_ID,
  ZERO_ADDRESS,
  ORDER_PROTOCOL_NAME,
  ORDER_PROTOCOL_VERSION,
  ORDER_STRUCTURE,
  ORDER_SIDE,
  SIGNATURE_TYPE,
  COLLATERAL_TOKEN_DECIMALS,
} from './constants.js'
import { parseUnits } from './abi-utils.js'
import type {
  ClobOrderRequest,
  ClobOrderResponse,
  ClobOrderbook,
  ClobOpenOrder,
  PolymarketMarket,
  SignedOrder,
  ClobPostOrderPayload,
  BatchBookParams,
  PriceHistoryPoint,
  DataApiPosition,
} from './types.js'

// ============================================================================
// Agent Wallet Address Resolution
// ============================================================================

/**
 * Get the EVM wallet address for an agent. We derive it from a dummy
 * signTypedData call — the Privy HSM returns the signer address alongside
 * the signature. Cached alongside CLOB credentials.
 */
async function getAgentWalletAddress(assistantId: string): Promise<string> {
  const creds = await getClobCredentials(assistantId)
  return creds.walletAddress
}

// ============================================================================
// CLOB API Key Management
// ============================================================================

interface ClobApiCredentials {
  apiKey: string
  apiSecret: string
  apiPassphrase: string
  walletAddress: string
}

/**
 * Derive CLOB API credentials by signing the EIP-712 ClobAuth message.
 * Matches the official @polymarket/clob-client flow:
 *   1. Sign ClobAuth EIP-712 typed data with wallet
 *   2. GET /api-key/derive with L1 auth headers
 */
export async function deriveClobApiKey(assistantId: string): Promise<ClobApiCredentials> {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = 0

  // Build L1 auth signature — same EIP-712 structure as official SDK
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    },
    primaryType: 'ClobAuth',
    domain: {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: 137,
    },
    message: {
      address: '', // Privy HSM fills this with the actual wallet address
      timestamp: String(timestamp),
      nonce,
      message: 'This message attests that I control the given wallet',
    },
  }

  const result = await signAgentWalletTypedData(assistantId, typedData)
  if (!result.success || !result.signature || !result.address) {
    throw new PolymarketAuthError(`Failed to derive CLOB API key: ${result.error}`)
  }

  const walletAddress = result.address

  // GET /api-key/derive with L1 auth headers (matches official SDK)
  const response = await fetchWithRetry(
    `${POLYMARKET_CLOB_URL}/api-key/derive?nonce=${nonce}`,
    {
      method: 'GET',
      headers: {
        'POLY_ADDRESS': walletAddress,
        'POLY_SIGNATURE': result.signature,
        'POLY_TIMESTAMP': String(timestamp),
        'POLY_NONCE': String(nonce),
      },
    },
  )

  const creds = (await response.json()) as { key?: string; secret?: string; passphrase?: string; apiKey?: string; apiSecret?: string; apiPassphrase?: string }

  // Handle both possible response shapes
  const apiKey = creds.apiKey ?? creds.key ?? ''
  const apiSecret = creds.apiSecret ?? creds.secret ?? ''
  const apiPassphrase = creds.apiPassphrase ?? creds.passphrase ?? ''

  if (!apiKey || !apiSecret) {
    throw new PolymarketAuthError('CLOB API key derivation returned empty credentials')
  }

  return { apiKey, apiSecret, apiPassphrase, walletAddress }
}

// ============================================================================
// LRU Cache with Promise Dedup
// ============================================================================

interface CacheEntry {
  credentials: ClobApiCredentials
  expiresAt: number
  lastUsed: number
}

const apiKeyCache = new Map<string, CacheEntry>()
const inflightDerivations = new Map<string, Promise<ClobApiCredentials>>()

function evictLRU(): void {
  if (apiKeyCache.size <= CLOB_API_KEY_CACHE_MAX) return
  let oldestKey = ''
  let oldestTime = Infinity
  for (const [key, entry] of apiKeyCache) {
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed
      oldestKey = key
    }
  }
  if (oldestKey) apiKeyCache.delete(oldestKey)
}

async function getClobCredentials(assistantId: string): Promise<ClobApiCredentials> {
  const cached = apiKeyCache.get(assistantId)
  if (cached && cached.expiresAt > Date.now()) {
    cached.lastUsed = Date.now()
    return cached.credentials
  }

  const inflight = inflightDerivations.get(assistantId)
  if (inflight) return inflight

  const derivation = deriveClobApiKey(assistantId)
    .then(credentials => {
      apiKeyCache.set(assistantId, {
        credentials,
        expiresAt: Date.now() + CLOB_API_KEY_TTL_MS,
        lastUsed: Date.now(),
      })
      evictLRU()
      return credentials
    })
    .finally(() => {
      inflightDerivations.delete(assistantId)
    })

  inflightDerivations.set(assistantId, derivation)
  return derivation
}

/** Exposed for testing — clears the credential cache. */
export function _clearClobCache(): void {
  apiKeyCache.clear()
  inflightDerivations.clear()
}

// ============================================================================
// L2 HMAC Request Signing (matches @polymarket/clob-client signing/hmac.ts)
// ============================================================================

/**
 * Build HMAC-SHA256 signature for L2 auth.
 * Signs: timestamp + method + requestPath + body
 */
function buildPolyHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string,
): string {
  const message = `${timestamp}${method}${requestPath}${body ?? ''}`

  // Secret is base64-encoded; decode it for HMAC key
  const secretBuffer = Buffer.from(secret, 'base64')
  const hmac = createHmac('sha256', secretBuffer)
  hmac.update(message)
  const sig = hmac.digest('base64')

  // URL-safe base64 (matches official SDK)
  return sig.replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Build L2 auth headers for an authenticated CLOB request.
 */
function buildL2Headers(
  creds: ClobApiCredentials,
  method: string,
  path: string,
  body?: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = buildPolyHmacSignature(creds.apiSecret, timestamp, method, path, body)

  return {
    'Content-Type': 'application/json',
    'POLY_ADDRESS': creds.walletAddress,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': String(timestamp),
    'POLY_API_KEY': creds.apiKey,
    'POLY_PASSPHRASE': creds.apiPassphrase,
  }
}

// ============================================================================
// Authenticated CLOB Fetch
// ============================================================================

async function clobAuthFetch<T>(
  path: string,
  assistantId: string,
  init?: RequestInit & { method?: string },
): Promise<T> {
  const creds = await getClobCredentials(assistantId)
  const method = (init?.method ?? 'GET').toUpperCase()
  const body = init?.body as string | undefined
  const headers = {
    ...buildL2Headers(creds, method, path, body),
    ...(init?.headers as Record<string, string>),
  }

  const response = await fetchWithRetry(`${POLYMARKET_CLOB_URL}${path}`, {
    ...init,
    method,
    headers,
  })

  return (await response.json()) as T
}

/**
 * Public CLOB fetch — no auth needed for read endpoints.
 */
async function clobPublicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithRetry(`${POLYMARKET_CLOB_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  })
  return (await response.json()) as T
}

// ============================================================================
// Market Data (Gamma REST — no auth needed)
// ============================================================================

/** Gamma API returns camelCase; our types use snake_case. Normalize here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeGammaMarket(raw: any): PolymarketMarket {
  const outcomes: string[] = typeof raw.outcomes === 'string' ? JSON.parse(raw.outcomes) : (raw.outcomes ?? [])
  const prices: string[] = typeof raw.outcomePrices === 'string' ? JSON.parse(raw.outcomePrices) : (raw.outcomePrices ?? [])
  const tokenIds: string[] = typeof raw.clobTokenIds === 'string' ? JSON.parse(raw.clobTokenIds) : (raw.clobTokenIds ?? [])

  return {
    condition_id: raw.conditionId ?? raw.condition_id ?? '',
    question_id: raw.questionID ?? raw.question_id ?? '',
    question: raw.question ?? '',
    description: raw.description ?? '',
    end_date_iso: raw.endDateIso ?? raw.end_date_iso ?? '',
    game_start_time: raw.gameStartTime ?? raw.game_start_time,
    active: raw.active ?? false,
    closed: raw.closed ?? false,
    archived: raw.archived ?? false,
    accepting_orders: raw.acceptingOrders ?? raw.accepting_orders ?? false,
    minimum_order_size: raw.orderMinSize ?? raw.minimum_order_size ?? '0',
    minimum_tick_size: raw.orderPriceMinTickSize ?? raw.minimum_tick_size ?? '0',
    neg_risk: raw.negRisk ?? raw.neg_risk ?? false,
    tokens: outcomes.map((outcome: string, i: number) => ({
      token_id: tokenIds[i] ?? '',
      outcome,
      price: parseFloat(prices[i] ?? '0'),
      winner: false,
    })),
  }
}

export async function getMarket(conditionId: string): Promise<PolymarketMarket | null> {
  try {
    const response = await fetchWithRetry(
      `${POLYMARKET_GAMMA_URL}/markets?condition_id=${encodeURIComponent(conditionId)}&limit=1`,
    )
    const data = (await response.json()) as Record<string, unknown>[]
    if (!data[0]) return null
    const market = normalizeGammaMarket(data[0])
    if (market.condition_id.toLowerCase() !== conditionId.toLowerCase()) {
      console.warn('[Polymarket] conditionId mismatch: requested', conditionId.substring(0, 16), 'got', market.condition_id.substring(0, 16))
      return null
    }
    return market
  } catch (error) {
    console.error('[Polymarket] getMarket failed:', {
      conditionId: conditionId.substring(0, 10),
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function searchMarkets(query: string, limit = 10): Promise<PolymarketMarket[]> {
  try {
    const response = await fetchWithRetry(
      `${POLYMARKET_GAMMA_URL}/markets?_q=${encodeURIComponent(query)}&active=true&closed=false&limit=${limit}`,
    )
    const data = (await response.json()) as Record<string, unknown>[]
    return data.map(normalizeGammaMarket)
  } catch (error) {
    console.error('[Polymarket] searchMarkets failed:', {
      query,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

// ============================================================================
// Orderbook (PUBLIC — no auth needed)
// ============================================================================

export async function getOrderbook(
  tokenId: string,
  _assistantId?: string,
): Promise<ClobOrderbook | null> {
  try {
    return await clobPublicFetch<ClobOrderbook>(
      `/orderbook?token_id=${encodeURIComponent(tokenId)}`,
    )
  } catch (error) {
    console.error('[Polymarket] getOrderbook failed:', {
      tokenId: tokenId.substring(0, 10),
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/** Batch orderbooks — POST /orderbooks (public, no auth) */
export async function getOrderbooks(
  tokenIds: string[],
): Promise<ClobOrderbook[]> {
  try {
    const params: BatchBookParams[] = tokenIds.map(token_id => ({ token_id }))
    return await clobPublicFetch<ClobOrderbook[]>('/orderbooks', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  } catch (error) {
    console.error('[Polymarket] getOrderbooks failed:', error instanceof Error ? error.message : String(error))
    return []
  }
}

// ============================================================================
// Price Data (PUBLIC — no auth needed)
// ============================================================================

/** GET /price — single token price */
export async function getPrice(
  tokenId: string,
  side: 'BUY' | 'SELL' = 'BUY',
): Promise<string | null> {
  try {
    const result = await clobPublicFetch<{ price: string }>(
      `/price?token_id=${encodeURIComponent(tokenId)}&side=${side}`,
    )
    return result.price ?? null
  } catch {
    return null
  }
}

/** POST /prices — batch prices */
export async function getPrices(
  tokenIds: string[],
  side: 'BUY' | 'SELL' = 'BUY',
): Promise<Record<string, string>> {
  try {
    const params = tokenIds.map(token_id => ({ token_id }))
    return await clobPublicFetch<Record<string, string>>(
      `/prices?side=${side}`,
      { method: 'POST', body: JSON.stringify(params) },
    )
  } catch {
    return {}
  }
}

/** GET /midpoint — single token midpoint */
export async function getMidpoint(tokenId: string): Promise<string | null> {
  try {
    const result = await clobPublicFetch<{ mid: string }>(
      `/midpoint?token_id=${encodeURIComponent(tokenId)}`,
    )
    return result.mid ?? null
  } catch {
    return null
  }
}

/** POST /midpoints — batch midpoints */
export async function getMidpoints(
  tokenIds: string[],
): Promise<Record<string, string>> {
  try {
    const params = tokenIds.map(token_id => ({ token_id }))
    return await clobPublicFetch<Record<string, string>>(
      '/midpoints',
      { method: 'POST', body: JSON.stringify(params) },
    )
  } catch {
    return {}
  }
}

/** GET /spread — single token spread */
export async function getSpread(tokenId: string): Promise<{ bid: string; ask: string; spread: string } | null> {
  try {
    return await clobPublicFetch<{ bid: string; ask: string; spread: string }>(
      `/spread?token_id=${encodeURIComponent(tokenId)}`,
    )
  } catch {
    return null
  }
}

/** POST /spreads — batch spreads */
export async function getSpreads(
  tokenIds: string[],
): Promise<Record<string, { bid: string; ask: string; spread: string }>> {
  try {
    const params = tokenIds.map(token_id => ({ token_id }))
    return await clobPublicFetch<Record<string, { bid: string; ask: string; spread: string }>>(
      '/spreads',
      { method: 'POST', body: JSON.stringify(params) },
    )
  } catch {
    return {}
  }
}

/** GET /last-trade-price */
export async function getLastTradePrice(tokenId: string): Promise<string | null> {
  try {
    const result = await clobPublicFetch<{ price: string }>(
      `/last-trade-price?token_id=${encodeURIComponent(tokenId)}`,
    )
    return result.price ?? null
  } catch {
    return null
  }
}

/** GET /prices-history — OHLC price history */
export async function getPriceHistory(
  tokenId: string,
  interval: '1m' | '1h' | '6h' | '1d' | '1w' | 'max' = '1d',
  fidelity?: number,
): Promise<PriceHistoryPoint[]> {
  try {
    let url = `/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}`
    if (fidelity !== undefined) url += `&fidelity=${fidelity}`
    const result = await clobPublicFetch<{ history: PriceHistoryPoint[] }>(url)
    return result.history ?? []
  } catch {
    return []
  }
}

// ============================================================================
// Market Metadata (PUBLIC — no auth needed)
// ============================================================================

/** GET /tick-size — tick size for a token */
export async function getTickSize(tokenId: string): Promise<string> {
  try {
    const result = await clobPublicFetch<{ minimum_tick_size: string }>(
      `/tick-size?token_id=${encodeURIComponent(tokenId)}`,
    )
    return result.minimum_tick_size ?? '0.01'
  } catch {
    return '0.01'
  }
}

/** GET /neg-risk — whether a token belongs to a neg-risk market */
export async function getNegRisk(tokenId: string): Promise<boolean> {
  try {
    const result = await clobPublicFetch<{ neg_risk: boolean }>(
      `/neg-risk?token_id=${encodeURIComponent(tokenId)}`,
    )
    return result.neg_risk ?? false
  } catch {
    return false
  }
}

/** GET /fee-rate — fee rate in basis points */
export async function getFeeRateBps(): Promise<number> {
  try {
    const result = await clobPublicFetch<{ fee_rate_bps: string }>(
      '/fee-rate',
    )
    return parseInt(result.fee_rate_bps ?? '0', 10)
  } catch {
    return 0
  }
}

// ============================================================================
// EIP-712 Order Signing
// ============================================================================

/**
 * Build and sign an order using EIP-712 typed data via Privy HSM.
 * Matches the official @polymarket/order-utils order struct.
 */
export async function buildSignedOrder(
  assistantId: string,
  request: ClobOrderRequest,
): Promise<SignedOrder> {
  const creds = await getClobCredentials(assistantId)
  const walletAddress = creds.walletAddress

  // Resolve neg-risk and fee rate
  const negRisk = request.negRisk ?? false
  const feeRateBps = request.feeRateBps ?? await getFeeRateBps()

  // Choose exchange contract based on neg-risk
  const exchangeAddress = negRisk
    ? POLYMARKET_CONTRACTS.NEG_RISK_CTF_EXCHANGE
    : POLYMARKET_CONTRACTS.CTF_EXCHANGE

  // Calculate raw amounts (matching @polymarket/clob-client helpers.ts)
  const rawPrice = request.price
  const rawSize = request.size
  const isBuy = request.side === 'BUY'

  let makerAmount: string
  let takerAmount: string

  if (isBuy) {
    // BUY: maker provides collateral (size * price), receives tokens (size)
    takerAmount = parseUnits(String(rawSize), COLLATERAL_TOKEN_DECIMALS)
    makerAmount = parseUnits(String(rawSize * rawPrice), COLLATERAL_TOKEN_DECIMALS)
  } else {
    // SELL: maker provides tokens (size), receives collateral (size * price)
    makerAmount = parseUnits(String(rawSize), COLLATERAL_TOKEN_DECIMALS)
    takerAmount = parseUnits(String(rawSize * rawPrice), COLLATERAL_TOKEN_DECIMALS)
  }

  // Generate random salt
  const salt = BigInt('0x' + randomBytes(32).toString('hex')).toString()

  // Build the EIP-712 order typed data
  const orderTypedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Order: ORDER_STRUCTURE.map(f => ({ name: f.name, type: f.type })),
    },
    primaryType: 'Order',
    domain: {
      name: ORDER_PROTOCOL_NAME,
      version: ORDER_PROTOCOL_VERSION,
      chainId: parseInt(POLYGON_CHAIN_ID, 10),
      verifyingContract: exchangeAddress,
    },
    message: {
      salt,
      maker: walletAddress,
      signer: walletAddress,
      taker: ZERO_ADDRESS,
      tokenId: request.tokenId,
      makerAmount,
      takerAmount,
      expiration: String(request.expiration ?? 0),
      nonce: '0',
      feeRateBps: String(feeRateBps),
      side: isBuy ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
      signatureType: SIGNATURE_TYPE.EOA,
    },
  }

  const result = await signAgentWalletTypedData(assistantId, orderTypedData)
  if (!result.success || !result.signature) {
    throw new PolymarketAuthError(`Failed to sign order: ${result.error}`)
  }

  return {
    salt,
    maker: walletAddress,
    signer: walletAddress,
    taker: ZERO_ADDRESS,
    tokenId: request.tokenId,
    makerAmount,
    takerAmount,
    expiration: String(request.expiration ?? 0),
    nonce: '0',
    feeRateBps: String(feeRateBps),
    side: isBuy ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
    signatureType: SIGNATURE_TYPE.EOA,
    signature: result.signature,
  }
}

// ============================================================================
// Order Placement (L2 Auth + Signed Order)
// ============================================================================

export async function placeOrder(
  assistantId: string,
  order: ClobOrderRequest,
): Promise<ClobOrderResponse> {
  try {
    // Build and sign the EIP-712 order
    const signedOrder = await buildSignedOrder(assistantId, order)
    const creds = await getClobCredentials(assistantId)

    // Build POST /order payload (matches official SDK orderToJson)
    const payload: ClobPostOrderPayload = {
      order: signedOrder,
      order_type: order.orderType,
      owner: creds.walletAddress,
      post_only: order.postOnly ?? false,
    }

    const body = JSON.stringify(payload)
    const path = '/order'
    const headers = buildL2Headers(creds, 'POST', path, body)

    const response = await fetchWithRetry(`${POLYMARKET_CLOB_URL}${path}`, {
      method: 'POST',
      headers,
      body,
    })

    return (await response.json()) as ClobOrderResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Order placement failed',
    }
  }
}

export async function cancelOrder(
  assistantId: string,
  orderId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await clobAuthFetch('/order', assistantId, {
      method: 'DELETE',
      body: JSON.stringify({ orderID: orderId }),
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Order cancellation failed',
    }
  }
}

// ============================================================================
// Batch Cancel (L2 Auth)
// ============================================================================

/** DELETE /orders — cancel multiple orders by IDs */
export async function cancelOrders(
  assistantId: string,
  orderIds: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    await clobAuthFetch('/orders', assistantId, {
      method: 'DELETE',
      body: JSON.stringify(orderIds),
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Batch cancel failed',
    }
  }
}

/** DELETE /orders/all — cancel all open orders */
export async function cancelAll(
  assistantId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await clobAuthFetch('/orders/all', assistantId, {
      method: 'DELETE',
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cancel all failed',
    }
  }
}

/** DELETE /orders/market — cancel all orders for a market */
export async function cancelMarketOrders(
  assistantId: string,
  marketId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await clobAuthFetch('/orders/market', assistantId, {
      method: 'DELETE',
      body: JSON.stringify({ market: marketId }),
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cancel market orders failed',
    }
  }
}

// ============================================================================
// Open Orders (L2 Auth)
// ============================================================================

export async function getOpenOrders(
  assistantId: string,
  market?: string,
): Promise<ClobOpenOrder[]> {
  try {
    const params = market ? `?market=${encodeURIComponent(market)}` : ''
    return await clobAuthFetch<ClobOpenOrder[]>(`/open-orders${params}`, assistantId)
  } catch (error) {
    console.error('[Polymarket] getOpenOrders failed:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

// ============================================================================
// Data API — Positions (public, no auth, by wallet address)
// ============================================================================

/** Fetch positions from Polymarket Data API (authoritative source) */
export async function getDataApiPositions(
  assistantId: string,
): Promise<DataApiPosition[]> {
  try {
    const walletAddress = await getAgentWalletAddress(assistantId)
    const response = await fetchWithRetry(
      `${POLYMARKET_DATA_URL}/positions?user=${encodeURIComponent(walletAddress)}&sizeThreshold=0`,
    )
    return (await response.json()) as DataApiPosition[]
  } catch (error) {
    console.error('[Polymarket] getDataApiPositions failed:', error instanceof Error ? error.message : String(error))
    return []
  }
}
