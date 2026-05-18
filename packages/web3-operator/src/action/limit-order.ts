/**
 * limit_order — Create limit orders on Solana via Jupiter Limit Order API.
 *
 * Architecture: simulation-first.
 *   1. Validate inputs
 *   2. Fetch current price for comparison
 *   3. Produce an ExecutionPlan
 *   4. Execution happens via the platform tool (session signer)
 *
 * Jupiter Limit Order API:
 *   POST https://api.jup.ag/limit/v2/createOrder
 *   - No API key required
 *   - Returns serialized transaction for signing
 */

import type { ExecutionPlan, SimulationResult } from '@lucid-fdn/web3-types'
import { toolGetPrice } from '../read/get-price.js'
import { resolveTokenAddress } from '../shared/token-constants.js'
import { validateTokenInput, validateAmount } from '../shared/validate.js'

export interface LimitOrderArgs {
  /** Token to sell (symbol or mint address) */
  inputToken: string
  /** Token to buy (symbol or mint address) */
  outputToken: string
  /** Amount to sell (in token units) */
  amount: string
  /** Limit price — execute when output token reaches this USD price */
  limitPrice: string
  /** Expiry in seconds from now (default: 7 days) */
  expirySecs?: number
}

/**
 * Create a limit order execution plan.
 * Does NOT execute — returns a plan for the platform tool.
 */
export async function toolLimitOrder(args: LimitOrderArgs): Promise<string> {
  // Validate inputs
  const inputErr = validateTokenInput(args.inputToken)
  if (inputErr) return JSON.stringify({ error: `Invalid inputToken: ${inputErr}` })
  const outputErr = validateTokenInput(args.outputToken)
  if (outputErr) return JSON.stringify({ error: `Invalid outputToken: ${outputErr}` })

  const inputMint = resolveTokenAddress(args.inputToken, 'solana')
  const outputMint = resolveTokenAddress(args.outputToken, 'solana')

  const limitPriceResult = validateAmount(args.limitPrice)
  if (typeof limitPriceResult === 'string') return JSON.stringify({ error: `Invalid limit price: ${limitPriceResult}` })
  const limitPrice = limitPriceResult

  const amountResult = validateAmount(args.amount)
  if (typeof amountResult === 'string') return JSON.stringify({ error: `Invalid amount: ${amountResult}` })
  const amount = amountResult

  // Get current price for comparison
  let currentPrice: number | null = null
  try {
    const priceResult = JSON.parse(await toolGetPrice({ token: args.outputToken, chain: 'solana' }))
    currentPrice = priceResult.price || null
  } catch {
    // Non-fatal
  }

  // Calculate expected output
  const expectedOutput = currentPrice
    ? (amount * (currentPrice / limitPrice)).toFixed(6)
    : 'unknown'

  const expirySecs = args.expirySecs || 7 * 24 * 3600 // 7 days default
  const expiryDate = new Date(Date.now() + expirySecs * 1000).toISOString()

  // Build simulation
  const simulation: SimulationResult = {
    success: true,
    estimatedOutput: expectedOutput,
    estimatedFeesUsd: 0.005, // Solana tx fee
    failureModes: [],
    netValueChangeUsd: undefined,
  }

  if (currentPrice && limitPrice > currentPrice * 1.5) {
    simulation.failureModes.push('Limit price is >50% above current price — may never fill')
  }
  if (currentPrice && limitPrice < currentPrice * 0.5) {
    simulation.failureModes.push('Limit price is >50% below current price — aggressive order')
  }

  const plan: ExecutionPlan = {
    planId: crypto.randomUUID(),
    goal: `Set limit order: sell ${args.amount} ${args.inputToken} when ${args.outputToken} reaches $${args.limitPrice}`,
    intent: 'limit_order',
    chain: 'solana',
    protocol: 'jupiter-limit',
    assetIn: { symbol: args.inputToken, address: inputMint, chain: 'solana' },
    assetOut: { symbol: args.outputToken, address: outputMint, chain: 'solana' },
    amountIn: args.amount,
    amountInUsd: currentPrice ? amount * currentPrice : undefined,
    route: {
      provider: 'jupiter-limit',
      expectedOutput,
      priceImpactBps: 0, // Limit orders have no price impact
      slippageBps: 0,
      feesUsd: 0.005,
      minimumOutput: expectedOutput,
      routePath: [`${args.inputToken} → ${args.outputToken} (limit @ $${args.limitPrice})`],
    },
    routeCandidates: [],
    risk: {
      level: simulation.failureModes.length > 0 ? 'medium' : 'low',
      checks: [
        {
          name: 'limit_vs_current',
          passed: !currentPrice || Math.abs(limitPrice - currentPrice) / currentPrice < 0.5,
          detail: currentPrice
            ? `Current: $${currentPrice.toFixed(4)}, Limit: $${limitPrice} (${((limitPrice / currentPrice - 1) * 100).toFixed(1)}% diff)`
            : 'Current price unavailable',
        },
      ],
    },
    simulation,
    recommendedAction: simulation.failureModes.length > 0 ? 'review' : 'execute',
    requiresConfirmation: true,
    summary: [
      `Limit Order: Sell ${args.amount} ${args.inputToken} for ${args.outputToken}`,
      `Trigger: when ${args.outputToken} reaches $${args.limitPrice}`,
      currentPrice ? `Current price: $${currentPrice.toFixed(4)}` : '',
      `Expires: ${expiryDate}`,
    ].filter(Boolean).join('\n'),
    createdAt: new Date().toISOString(),
  }

  // Include Jupiter API params for the platform tool to execute
  return JSON.stringify({
    plan,
    jupiterParams: {
      inputMint,
      outputMint,
      inAmount: args.amount,
      outAmount: expectedOutput,
      expiredAt: expiryDate,
    },
    formatted: plan.summary,
  })
}
