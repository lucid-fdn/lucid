/**
 * bridge — Cross-chain token bridge via DeBridge (mirrors GOAT SDK).
 *
 * Architecture: Simulation-first. Returns an ExecutionPlan with the bridge
 * quote, route, fees, and tx data. Does NOT execute.
 *
 * API: https://deswap.debridge.finance/v1.0/dln/order/create-tx
 * Free, no key required. Supports EVM + Solana.
 */

import type { ExecutionPlan, SimulationResult } from '@lucid-fdn/web3-types'
import {
  DEBRIDGE_CHAIN_IDS,
  DEBRIDGE_NATIVE_TOKENS,
  DEBRIDGE_SYMBOL_TO_ADDRESS,
} from '../shared/token-constants.js'
import { validateAddress, validateTokenInput, validateAmount } from '../shared/validate.js'
import { rateLimitedFetch } from '../shared/rate-limit.js'
import { providerUrl } from '../shared/providers.js'

export interface BridgeArgs {
  /** Token to bridge (contract address — use full address, NOT symbol) */
  fromToken: string
  /** Destination token (contract address, default: same as fromToken) */
  toToken?: string
  /** Source chain */
  fromChain: string
  /** Destination chain */
  toChain: string
  /** Amount to bridge (in token units, e.g. "100") */
  amount: string
  /** Sender wallet address */
  fromAddress: string
  /** Receiver address (defaults to fromAddress) */
  toAddress?: string
}

// Base URL from centralized provider registry (shared/providers.ts)

function resolveAddress(tokenOrAddr: string, chain: string): string {
  const upper = tokenOrAddr.toUpperCase()
  return DEBRIDGE_SYMBOL_TO_ADDRESS[chain]?.[upper] || tokenOrAddr
}

function getTokenInfo(addr: string, chain: string): { symbol: string; decimals: number } {
  return DEBRIDGE_NATIVE_TOKENS[chain]?.[addr.toLowerCase()] || { symbol: addr.slice(0, 8), decimals: 18 }
}

export async function toolBridge(args: BridgeArgs): Promise<string> {
  // Validate inputs
  const tokenErr = validateTokenInput(args.fromToken)
  if (tokenErr) return JSON.stringify({ error: `Invalid fromToken: ${tokenErr}` })
  const addrErr = validateAddress(args.fromAddress, args.fromChain)
  if (addrErr) return JSON.stringify({ error: `Invalid fromAddress: ${addrErr}` })
  if (args.toAddress) {
    const toAddrErr = validateAddress(args.toAddress, args.toChain)
    if (toAddrErr) return JSON.stringify({ error: `Invalid toAddress: ${toAddrErr}` })
  }

  const amountResult = validateAmount(args.amount)
  if (typeof amountResult === 'string') return JSON.stringify({ error: amountResult })
  const amount = amountResult

  const srcChainId = DEBRIDGE_CHAIN_IDS[args.fromChain]
  const dstChainId = DEBRIDGE_CHAIN_IDS[args.toChain]
  if (!srcChainId || !dstChainId) {
    return JSON.stringify({
      error: `Unsupported chain. Supported: ${Object.keys(DEBRIDGE_CHAIN_IDS).join(', ')}`,
    })
  }

  if (args.fromChain === args.toChain) {
    return JSON.stringify({
      error: 'Source and destination chain are the same. Use dex_swap for same-chain swaps.',
    })
  }

  // Resolve symbols → addresses
  const srcTokenAddr = resolveAddress(args.fromToken, args.fromChain)
  const dstTokenAddr = resolveAddress(args.toToken || args.fromToken, args.toChain)
  const srcTokenInfo = getTokenInfo(srcTokenAddr, args.fromChain)
  const dstTokenInfo = getTokenInfo(dstTokenAddr, args.toChain)
  const toAddress = args.toAddress || args.fromAddress

  // Convert to raw amount
  const rawAmount = BigInt(Math.round(amount * (10 ** srcTokenInfo.decimals))).toString()

  try {
    // DeBridge create-tx endpoint (same as GOAT SDK)
    const params = new URLSearchParams({
      srcChainId: srcChainId.toString(),
      srcChainTokenIn: srcTokenAddr,
      srcChainTokenInAmount: rawAmount,
      dstChainId: dstChainId.toString(),
      dstChainTokenOut: dstTokenAddr,
      dstChainTokenOutRecipient: toAddress,
      prependOperatingExpenses: 'true',
    })

    // Add authority for Solana
    if (args.fromChain === 'solana') {
      params.set('srcChainOrderAuthorityAddress', args.fromAddress)
      params.set('dstChainOrderAuthorityAddress', toAddress)
    }

    const res = await rateLimitedFetch(
      providerUrl('debridge', `/dln/order/create-tx?${params}`),
      { signal: AbortSignal.timeout(15000) },
    )

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return JSON.stringify({
        error: `DeBridge quote failed (${res.status})`,
        detail: errBody.slice(0, 300),
      })
    }

    const data = await res.json() as {
      orderId?: string
      estimation?: {
        srcChainTokenIn?: { amount: string; approximateOperatingExpense?: string; mutatedWithOperatingExpense?: boolean }
        srcChainTokenOut?: { amount: string; maxTheoreticalAmount?: string }
        dstChainTokenOut?: { amount: string; recommendedAmount?: string; maxTheoreticalAmount?: string }
        costsDetails?: Array<{ chain: string; tokenIn: string; tokenOut: string; amountIn: string; amountOut: string; type: string }>
      }
      tx?: { to: string; data: string; value: string }
      order?: { approximateFulfillmentDelay?: number }
      error?: { message?: string }
    }

    if (data.error) {
      return JSON.stringify({ error: data.error.message || 'DeBridge error' })
    }

    if (!data.estimation) {
      return JSON.stringify({ error: 'No bridge route found' })
    }

    const est = data.estimation
    const dstAmount = est.dstChainTokenOut?.recommendedAmount || est.dstChainTokenOut?.amount || '0'
    const expectedOutput = (Number(BigInt(dstAmount)) / (10 ** dstTokenInfo.decimals)).toFixed(6)
    const maxOutput = est.dstChainTokenOut?.maxTheoreticalAmount
      ? (Number(BigInt(est.dstChainTokenOut.maxTheoreticalAmount)) / (10 ** dstTokenInfo.decimals)).toFixed(6)
      : expectedOutput

    // Calculate fees from operating expenses
    const opExpense = est.srcChainTokenIn?.approximateOperatingExpense
      ? Number(BigInt(est.srcChainTokenIn.approximateOperatingExpense)) / (10 ** srcTokenInfo.decimals)
      : 0
    const feesEstimate = opExpense // DeBridge fees are included in the input amount

    const durationMin = data.order?.approximateFulfillmentDelay
      ? Math.ceil(data.order.approximateFulfillmentDelay / 60)
      : null

    const simulation: SimulationResult = {
      success: true,
      estimatedOutput: expectedOutput,
      estimatedFeesUsd: feesEstimate, // approximate, in token terms not USD
      failureModes: [],
    }

    const plan: ExecutionPlan = {
      planId: data.orderId || crypto.randomUUID(),
      goal: `Bridge ${args.amount} ${srcTokenInfo.symbol} from ${args.fromChain} to ${args.toChain}`,
      intent: 'bridge',
      chain: args.fromChain as ExecutionPlan['chain'],
      protocol: 'debridge',
      assetIn: {
        symbol: srcTokenInfo.symbol,
        address: srcTokenAddr,
        chain: args.fromChain as ExecutionPlan['chain'],
      },
      assetOut: {
        symbol: dstTokenInfo.symbol,
        address: dstTokenAddr,
        chain: args.toChain as ExecutionPlan['chain'],
      },
      amountIn: args.amount,
      route: {
        provider: 'DeBridge DLN',
        expectedOutput,
        priceImpactBps: 0,
        slippageBps: 0, // DeBridge uses fixed output amounts
        feesUsd: feesEstimate,
        minimumOutput: expectedOutput, // DeBridge guarantees the output
        routePath: [`${srcTokenInfo.symbol} (${args.fromChain}) → ${dstTokenInfo.symbol} (${args.toChain}) via DeBridge`],
      },
      routeCandidates: [],
      risk: {
        level: 'low',
        checks: [
          {
            name: 'bridge_route',
            passed: true,
            detail: 'Route: DeBridge DLN (decentralized liquidity network)',
          },
          {
            name: 'bridge_output',
            passed: true,
            detail: `Expected: ${expectedOutput} ${dstTokenInfo.symbol}, Max: ${maxOutput} ${dstTokenInfo.symbol}`,
          },
          {
            name: 'bridge_duration',
            passed: true,
            detail: durationMin ? `Estimated: ~${durationMin} minutes` : 'Duration varies by chain',
          },
        ],
      },
      simulation,
      recommendedAction: 'execute',
      requiresConfirmation: true,
      summary: [
        `Bridge: ${args.amount} ${srcTokenInfo.symbol}`,
        `${args.fromChain} → ${args.toChain}`,
        `Expected output: ${expectedOutput} ${dstTokenInfo.symbol}`,
        durationMin ? `Time: ~${durationMin} minutes` : '',
        'Via: DeBridge DLN',
      ].filter(Boolean).join('\n'),
      createdAt: new Date().toISOString(),
    }

    return JSON.stringify({
      plan,
      debridgeOrderId: data.orderId,
      tx: data.tx || null,
      formatted: plan.summary,
    })
  } catch (err) {
    return JSON.stringify({
      error: `Bridge quote failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
}
