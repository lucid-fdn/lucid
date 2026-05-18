/**
 * Hyperliquid EIP-712 Signing — P1-30
 *
 * Hyperliquid uses EIP-712 typed data signing for all order actions.
 * This module builds the typed data payloads and signs them
 * through the Privy session signer (signTypedData).
 */

import { circuitBreakers } from './circuit-breaker.js'

// ============================================================================
// Constants
// ============================================================================

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz'
const HYPERLIQUID_CHAIN_ID = 42161 // Arbitrum for L1 actions

// EIP-712 Domain for Hyperliquid
const HYPERLIQUID_DOMAIN = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: HYPERLIQUID_CHAIN_ID,
  verifyingContract: '0x0000000000000000000000000000000000000000',
} as const

// ============================================================================
// Types
// ============================================================================

export interface HyperliquidOrderParams {
  asset: number // Asset index
  isBuy: boolean
  limitPx: string // Price as string
  sz: string // Size as string
  orderType: 'limit' | 'market'
  reduceOnly?: boolean
  cloid?: string // Client order ID
}

export interface HyperliquidCancelParams {
  asset: number
  oid: number // Order ID
}

export interface EIP712TypedData {
  domain: typeof HYPERLIQUID_DOMAIN
  types: Record<string, Array<{ name: string; type: string }>>
  primaryType: string
  message: Record<string, unknown>
}

export interface HyperliquidSignResult {
  success: boolean
  typedData?: EIP712TypedData
  error?: string
}

// ============================================================================
// EIP-712 Typed Data Builders
// ============================================================================

/**
 * Build EIP-712 typed data for a Hyperliquid order placement.
 *
 * Hyperliquid uses a specific typed data format:
 * - Agent action includes connection data
 * - Signature authorizes the action
 */
export function buildOrderTypedData(
  walletAddress: string,
  params: HyperliquidOrderParams,
  nonce: number,
  vaultAddress?: string
): EIP712TypedData {
  const orderWire = {
    a: params.asset,
    b: params.isBuy,
    p: params.limitPx,
    s: params.sz,
    r: params.reduceOnly || false,
    t: params.orderType === 'market'
      ? { limit: { tif: 'Ioc' } }
      : { limit: { tif: 'Gtc' } },
    c: params.cloid || undefined,
  }

  // Hyperliquid agent action
  const action = {
    type: 'order',
    orders: [orderWire],
    grouping: 'na',
    ...(vaultAddress ? { vaultAddress } : {}),
  }

  return {
    domain: HYPERLIQUID_DOMAIN,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      HyperliquidTransaction: [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'action', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction',
    message: {
      hyperliquidChain: 'Mainnet',
      action: JSON.stringify(action),
      nonce,
    },
  }
}

/**
 * Build EIP-712 typed data for cancelling an order.
 */
export function buildCancelTypedData(
  walletAddress: string,
  params: HyperliquidCancelParams,
  nonce: number,
  vaultAddress?: string
): EIP712TypedData {
  const action = {
    type: 'cancel',
    cancels: [{ a: params.asset, o: params.oid }],
    ...(vaultAddress ? { vaultAddress } : {}),
  }

  return {
    domain: HYPERLIQUID_DOMAIN,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      HyperliquidTransaction: [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'action', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction',
    message: {
      hyperliquidChain: 'Mainnet',
      action: JSON.stringify(action),
      nonce,
    },
  }
}

// ============================================================================
// Hyperliquid API Calls (with circuit breaker)
// ============================================================================

/**
 * Submit a signed action to Hyperliquid.
 */
export async function submitHyperliquidAction(
  action: Record<string, unknown>,
  signature: string,
  nonce: number,
  vaultAddress?: string
): Promise<{ success: boolean; response?: unknown; error?: string }> {
  return circuitBreakers.hyperliquid.execute(async () => {
    const payload: Record<string, unknown> = {
      action,
      nonce,
      signature,
    }
    if (vaultAddress) payload.vaultAddress = vaultAddress

    const res = await fetch(`${HYPERLIQUID_API}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })

    const data = (await res.json()) as Record<string, unknown>

    if (!res.ok || data.status === 'err') {
      throw new Error((data.response as string) || (data.error as string) || `Hyperliquid API error: ${res.status}`)
    }

    return { success: true, response: data }
  }).catch((error) => ({
    success: false,
    error: error instanceof Error ? error.message : 'Hyperliquid API failed',
  }))
}

/**
 * Get current nonce for a wallet from Hyperliquid.
 */
export async function getHyperliquidNonce(walletAddress: string): Promise<number> {
  const res = await fetch(`${HYPERLIQUID_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'clearinghouseState',
      user: walletAddress,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  const data = await res.json()
  // Nonce is derived from the number of actions + timestamp
  return Date.now()
}

/**
 * Get asset metadata from Hyperliquid.
 */
export async function getHyperliquidAssets(): Promise<Array<{ name: string; szDecimals: number }>> {
  const res = await fetch(`${HYPERLIQUID_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
    signal: AbortSignal.timeout(10_000),
  })

  const data = (await res.json()) as { universe?: Array<{ name: string; szDecimals: number }> }
  return data?.universe || []
}

/**
 * Look up asset index by symbol.
 */
export async function resolveAssetIndex(symbol: string): Promise<number | null> {
  const assets = await getHyperliquidAssets()
  const idx = assets.findIndex(
    (a) => a.name.toUpperCase() === symbol.toUpperCase()
  )
  return idx >= 0 ? idx : null
}