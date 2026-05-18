/**
 * get_quote_0x — Get EVM swap quotes via 0x Protocol (mirrors GOAT @goat-sdk/plugin-0x).
 *
 * 0x aggregates across all major EVM DEXs (Uniswap, SushiSwap, Curve, Balancer, etc.).
 * Requires: ZEROX_API_KEY env var (free tier from 0x.org/docs).
 *
 * This is complementary to Jupiter (Solana) and DexScreener (price only).
 * 0x provides executable swap quotes with tx data for EVM chains.
 */

import type { Chain } from '@lucid-fdn/web3-types'
import {
  EVM_CHAIN_IDS,
  resolveTokenAddress,
  getTokenDecimals,
} from '../shared/token-constants.js'
import { validateTokenInput, validateAmount } from '../shared/validate.js'
import { rateLimitedFetch } from '../shared/rate-limit.js'
import { zerox, providerUrl } from '../shared/providers.js'

export interface GetQuote0xArgs {
  /** Token to sell (symbol or address) */
  sellToken: string
  /** Token to buy (symbol or address) */
  buyToken: string
  /** Amount to sell in human-readable units (e.g. "100" for 100 USDC) */
  sellAmount: string
  /** Chain to swap on */
  chain: Chain
  /** Taker address (for accurate gas estimates) */
  takerAddress?: string
  /** Slippage in basis points (default: 100 = 1%) */
  slippageBps?: number
}

/**
 * Get a swap quote from 0x Protocol.
 * Returns price indicative quote (no tx data) — use for comparison.
 */
export async function toolGetQuote0x(args: GetQuote0xArgs): Promise<string> {
  const zx = zerox()
  if (!zx.available) {
    return JSON.stringify({
      error: '0x API key not configured',
      suggestion: 'Set ZEROX_API_KEY env var (free from dashboard.0x.org)',
    })
  }

  // Validate inputs
  const sellErr = validateTokenInput(args.sellToken)
  if (sellErr) return JSON.stringify({ error: `Invalid sellToken: ${sellErr}` })
  const buyErr = validateTokenInput(args.buyToken)
  if (buyErr) return JSON.stringify({ error: `Invalid buyToken: ${buyErr}` })
  const amountResult = validateAmount(args.sellAmount)
  if (typeof amountResult === 'string') return JSON.stringify({ error: amountResult })

  const chainId = EVM_CHAIN_IDS[args.chain]
  if (!chainId) {
    return JSON.stringify({ error: `Unsupported chain: ${args.chain}` })
  }

  const sellToken = resolveTokenAddress(args.sellToken, args.chain)
  const buyToken = resolveTokenAddress(args.buyToken, args.chain)
  const decimals = getTokenDecimals(sellToken)
  const sellAmountBase = BigInt(Math.round(parseFloat(args.sellAmount) * (10 ** decimals))).toString()

  try {
    const params = new URLSearchParams({
      chainId: chainId.toString(),
      sellToken,
      buyToken,
      sellAmount: sellAmountBase,
    })
    if (args.takerAddress) {
      params.set('taker', args.takerAddress)
      params.set('txOrigin', args.takerAddress)
    }
    if (args.slippageBps) {
      params.set('slippageBps', args.slippageBps.toString())
    }

    const res = await rateLimitedFetch(
      providerUrl('zerox', `/swap/allowance-holder/price?${params}`),
      {
        headers: zx.headers,
        signal: AbortSignal.timeout(10000),
      },
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error')
      return JSON.stringify({ error: `0x API error: ${res.status}`, detail: errText })
    }

    const data = await res.json() as {
      buyAmount?: string
      sellAmount?: string
      price?: string
      estimatedGas?: string
      gasPrice?: string
      grossBuyAmount?: string
      estimatedPriceImpact?: string
      sources?: Array<{ name: string; proportion: string }>
      fees?: { zeroExFee?: { amount?: string; token?: string } }
      issues?: { allowance?: { spender: string } | null }
    }

    const buyDecimals = getTokenDecimals(buyToken)
    const buyAmountHuman = data.buyAmount
      ? (Number(BigInt(data.buyAmount)) / (10 ** buyDecimals)).toString()
      : '?'

    // Extract active liquidity sources
    const sources = (data.sources || [])
      .filter(s => parseFloat(s.proportion) > 0)
      .map(s => `${s.name} (${(parseFloat(s.proportion) * 100).toFixed(0)}%)`)

    return JSON.stringify({
      quote: {
        sellToken: args.sellToken,
        buyToken: args.buyToken,
        sellAmount: args.sellAmount,
        buyAmount: buyAmountHuman,
        price: data.price,
        priceImpact: data.estimatedPriceImpact,
        estimatedGas: data.estimatedGas,
        sources,
        chain: args.chain,
        protocol: '0x',
        needsApproval: data.issues?.allowance !== null,
        approvalSpender: data.issues?.allowance?.spender,
      },
      formatted: `${args.sellAmount} ${args.sellToken} → ${buyAmountHuman} ${args.buyToken} via 0x (${args.chain})${sources.length ? ` | Sources: ${sources.join(', ')}` : ''}`,
    })
  } catch (err) {
    return JSON.stringify({
      error: `0x quote failed: ${err instanceof Error ? err.message : 'Unknown'}`,
    })
  }
}

/**
 * Get an executable swap quote from 0x (includes tx data).
 * This is what you'd submit on-chain. Simulation-first — returns the plan.
 */
export async function toolSwapQuote0x(args: GetQuote0xArgs & { takerAddress: string }): Promise<string> {
  const zx = zerox()
  if (!zx.available) {
    return JSON.stringify({ error: '0x API key not configured' })
  }

  const chainId = EVM_CHAIN_IDS[args.chain]
  if (!chainId) {
    return JSON.stringify({ error: `Unsupported chain: ${args.chain}` })
  }

  const sellToken = resolveTokenAddress(args.sellToken, args.chain)
  const buyToken = resolveTokenAddress(args.buyToken, args.chain)
  const decimals = getTokenDecimals(sellToken)
  const sellAmountBase = BigInt(Math.round(parseFloat(args.sellAmount) * (10 ** decimals))).toString()

  try {
    const params = new URLSearchParams({
      chainId: chainId.toString(),
      sellToken,
      buyToken,
      sellAmount: sellAmountBase,
      taker: args.takerAddress,
      txOrigin: args.takerAddress,
    })
    if (args.slippageBps) {
      params.set('slippageBps', args.slippageBps.toString())
    }

    const res = await rateLimitedFetch(
      providerUrl('zerox', `/swap/allowance-holder/quote?${params}`),
      {
        headers: zx.headers,
        signal: AbortSignal.timeout(10000),
      },
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error')
      return JSON.stringify({ error: `0x API error: ${res.status}`, detail: errText })
    }

    const data = await res.json() as {
      buyAmount?: string
      sellAmount?: string
      price?: string
      estimatedGas?: string
      transaction?: { to: string; data: string; value: string; gas: string; gasPrice: string }
      issues?: { allowance?: { spender: string } | null }
    }

    const buyDecimals = getTokenDecimals(buyToken)
    const buyAmountHuman = data.buyAmount
      ? (Number(BigInt(data.buyAmount)) / (10 ** buyDecimals)).toString()
      : '?'

    return JSON.stringify({
      plan: {
        intent: 'swap',
        protocol: '0x',
        chain: args.chain,
        sellToken: args.sellToken,
        buyToken: args.buyToken,
        sellAmount: args.sellAmount,
        buyAmount: buyAmountHuman,
        price: data.price,
        requiresConfirmation: true,
        recommendedAction: 'execute',
        needsApproval: data.issues?.allowance !== null,
        approvalSpender: data.issues?.allowance?.spender,
      },
      transaction: data.transaction,
    })
  } catch (err) {
    return JSON.stringify({
      error: `0x swap quote failed: ${err instanceof Error ? err.message : 'Unknown'}`,
    })
  }
}
