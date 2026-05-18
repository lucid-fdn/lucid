/**
 * dca_create — Dollar-Cost Averaging via Jupiter DCA program.
 *
 * Architecture: simulation-first.
 *   1. Validate inputs
 *   2. Calculate per-order amounts
 *   3. Produce an ExecutionPlan
 *   4. Execution happens via the platform tool
 *
 * Jupiter DCA:
 *   - Automated recurring swaps on Solana
 *   - Supports any token pair
 *   - Configurable frequency and duration
 */

import type { ExecutionPlan, SimulationResult } from '@lucid-fdn/web3-types'
import { toolGetPrice } from '../read/get-price.js'
import { resolveTokenAddress } from '../shared/token-constants.js'
import { validateTokenInput, validateAmount } from '../shared/validate.js'
import { formatInterval } from '../shared/format.js'

export interface DCACreateArgs {
  /** Token to sell (what you're spending) */
  inputToken: string
  /** Token to buy (what you're accumulating) */
  outputToken: string
  /** Total amount to invest (in input token units) */
  totalAmount: string
  /** Number of orders to split into */
  numberOfOrders: number
  /** Interval between orders in seconds (e.g. 3600 = hourly, 86400 = daily) */
  intervalSecs: number
  /** Minimum output per order (slippage protection, optional) */
  minOutputPerOrder?: string
}

export async function toolDCACreate(args: DCACreateArgs): Promise<string> {
  // Validate inputs
  const inputErr = validateTokenInput(args.inputToken)
  if (inputErr) return JSON.stringify({ error: `Invalid inputToken: ${inputErr}` })
  const outputErr = validateTokenInput(args.outputToken)
  if (outputErr) return JSON.stringify({ error: `Invalid outputToken: ${outputErr}` })

  const inputMint = resolveTokenAddress(args.inputToken, 'solana')
  const outputMint = resolveTokenAddress(args.outputToken, 'solana')
  const { numberOfOrders, intervalSecs } = args

  // Validate
  const amountResult = validateAmount(args.totalAmount)
  if (typeof amountResult === 'string') return JSON.stringify({ error: amountResult })
  const totalAmount = amountResult
  if (numberOfOrders < 2 || numberOfOrders > 1000) {
    return JSON.stringify({ error: 'Number of orders must be between 2 and 1000' })
  }
  if (intervalSecs < 60) {
    return JSON.stringify({ error: 'Minimum interval is 60 seconds' })
  }

  const amountPerOrder = totalAmount / numberOfOrders
  const totalDurationSecs = intervalSecs * (numberOfOrders - 1)
  const endDate = new Date(Date.now() + totalDurationSecs * 1000).toISOString()

  // Get current price for estimates
  let currentPrice: number | null = null
  let inputPrice: number | null = null
  try {
    const [outResult, inResult] = await Promise.all([
      toolGetPrice({ token: args.outputToken, chain: 'solana' }).then(r => JSON.parse(r)),
      toolGetPrice({ token: args.inputToken, chain: 'solana' }).then(r => JSON.parse(r)),
    ])
    currentPrice = outResult.price || null
    inputPrice = inResult.price || null
  } catch {
    // Non-fatal
  }

  const totalValueUsd = inputPrice ? totalAmount * inputPrice : undefined
  const estimatedOutputPerOrder = currentPrice && inputPrice
    ? ((amountPerOrder * inputPrice) / currentPrice).toFixed(6)
    : 'unknown'
  const estimatedTotalOutput = currentPrice && inputPrice
    ? ((totalAmount * inputPrice) / currentPrice).toFixed(6)
    : 'unknown'

  const simulation: SimulationResult = {
    success: true,
    estimatedOutput: estimatedTotalOutput,
    estimatedFeesUsd: 0.005 * numberOfOrders, // Per-tx fee
    failureModes: [],
  }

  if (numberOfOrders > 100) {
    simulation.failureModes.push('Large number of orders — higher total gas fees')
  }
  if (intervalSecs < 300 && numberOfOrders > 10) {
    simulation.failureModes.push('High frequency + many orders — consider a longer interval')
  }

  const plan: ExecutionPlan = {
    planId: crypto.randomUUID(),
    goal: `DCA: Buy ${args.outputToken} with ${args.totalAmount} ${args.inputToken} over ${formatInterval(totalDurationSecs)}`,
    intent: 'dca',
    chain: 'solana',
    protocol: 'jupiter-dca',
    assetIn: { symbol: args.inputToken, address: inputMint, chain: 'solana' },
    assetOut: { symbol: args.outputToken, address: outputMint, chain: 'solana' },
    amountIn: args.totalAmount,
    amountInUsd: totalValueUsd,
    route: {
      provider: 'jupiter-dca',
      expectedOutput: estimatedTotalOutput,
      priceImpactBps: 0, // DCA minimizes impact
      slippageBps: 100,
      feesUsd: 0.005 * numberOfOrders,
      minimumOutput: args.minOutputPerOrder
        ? (parseFloat(args.minOutputPerOrder) * numberOfOrders).toString()
        : '0',
      routePath: [`${args.inputToken} → ${args.outputToken} (DCA × ${numberOfOrders})`],
    },
    routeCandidates: [],
    risk: {
      level: simulation.failureModes.length > 0 ? 'medium' : 'low',
      checks: [
        {
          name: 'dca_duration',
          passed: totalDurationSecs <= 30 * 86400,
          detail: `DCA runs for ${formatInterval(totalDurationSecs)}`,
        },
        {
          name: 'per_order_size',
          passed: true,
          detail: `${amountPerOrder.toFixed(4)} ${args.inputToken} per order (~${estimatedOutputPerOrder} ${args.outputToken})`,
        },
      ],
    },
    simulation,
    recommendedAction: 'execute',
    requiresConfirmation: true,
    summary: [
      `DCA Strategy: ${args.outputToken}`,
      `Total: ${args.totalAmount} ${args.inputToken}${totalValueUsd ? ` ($${totalValueUsd.toFixed(2)})` : ''}`,
      `Split: ${numberOfOrders} orders × ${amountPerOrder.toFixed(4)} ${args.inputToken}`,
      `Frequency: every ${formatInterval(intervalSecs)}`,
      `Duration: ${formatInterval(totalDurationSecs)}`,
      `Est. total output: ~${estimatedTotalOutput} ${args.outputToken}`,
      `Ends: ${endDate}`,
    ].join('\n'),
    createdAt: new Date().toISOString(),
  }

  return JSON.stringify({
    plan,
    dcaParams: {
      inputMint,
      outputMint,
      inAmount: totalAmount,
      inAmountPerCycle: amountPerOrder,
      cycleFrequency: intervalSecs,
      numberOfOrders,
      minOutAmountPerCycle: args.minOutputPerOrder ? parseFloat(args.minOutputPerOrder) : undefined,
    },
    formatted: plan.summary,
  })
}
