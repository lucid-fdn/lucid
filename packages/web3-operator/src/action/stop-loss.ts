/**
 * stop_loss — Set a stop-loss trigger via cron-based price monitoring.
 *
 * Architecture: Uses the agent's existing cron_schedule tool to poll
 * the price at regular intervals. When the price drops below the
 * trigger, the agent executes the sell via dex_swap.
 *
 * This is a pragmatic approach — no on-chain trigger orders needed.
 * The agent IS the executor, using its own scheduling + trading tools.
 */

import type { ExecutionPlan, SimulationResult } from '@lucid-fdn/web3-types'
import { toolGetPrice } from '../read/get-price.js'
import { validateAmount, validateTokenInput } from '../shared/validate.js'

/** Max concurrent stop-loss / cron monitors per assistant */
const MAX_CRON_TASKS_PER_ASSISTANT = 5

export interface StopLossArgs {
  /** Token to monitor and sell if triggered */
  token: string
  /** Amount to sell when triggered */
  amount: string
  /** Trigger price in USD — sell when price drops to or below this */
  triggerPrice: string
  /** What to sell into (default: USDC) */
  outputToken?: string
  /** Check interval in minutes (default: 5) */
  checkIntervalMinutes?: number
  /** Expiry in hours (default: 168 = 7 days) */
  expiryHours?: number
  /** Injected by executor: assistant ID for guardrail check */
  assistantId?: string
  /** Injected by executor: DB client for counting existing tasks */
  _dbClient?: unknown
}

export async function toolStopLoss(args: StopLossArgs): Promise<string> {
  // ── Guardrail: cap concurrent cron tasks per assistant ──
  if (args.assistantId && args._dbClient) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = args._dbClient as any
      const { count, error } = await sb
        .from('agent_scheduled_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assistant_id', args.assistantId)
        .in('status', ['pending', 'active'])

      if (!error && count !== null && count >= MAX_CRON_TASKS_PER_ASSISTANT) {
        return JSON.stringify({
          error: `Maximum concurrent monitors reached (${MAX_CRON_TASKS_PER_ASSISTANT}). Cancel an existing stop-loss or scheduled task first.`,
          activeTasks: count,
          limit: MAX_CRON_TASKS_PER_ASSISTANT,
        })
      }
    } catch {
      // Non-fatal — proceed without guardrail if DB unavailable
    }
  }

  // Validate inputs
  const tokenErr = validateTokenInput(args.token)
  if (tokenErr) return JSON.stringify({ error: `Invalid token: ${tokenErr}` })

  const triggerResult = validateAmount(args.triggerPrice)
  if (typeof triggerResult === 'string') return JSON.stringify({ error: `Invalid trigger price: ${triggerResult}` })
  const triggerPrice = triggerResult

  const amountResult = validateAmount(args.amount)
  if (typeof amountResult === 'string') return JSON.stringify({ error: `Invalid amount: ${amountResult}` })
  const amount = amountResult

  const outputToken = args.outputToken || 'USDC'
  const checkInterval = Math.max(1, args.checkIntervalMinutes || 5)
  const expiryHours = args.expiryHours || 168

  // Get current price
  let currentPrice: number | null = null
  try {
    const priceResult = JSON.parse(await toolGetPrice({ token: args.token, chain: 'solana' }))
    currentPrice = priceResult.price || null
  } catch {
    // Non-fatal
  }

  const simulation: SimulationResult = {
    success: true,
    estimatedOutput: currentPrice ? (amount * triggerPrice).toFixed(2) : 'unknown',
    estimatedFeesUsd: 0.005,
    failureModes: [],
  }

  // Validate trigger makes sense
  if (currentPrice) {
    if (triggerPrice >= currentPrice) {
      simulation.failureModes.push(
        `Trigger ($${triggerPrice}) >= current price ($${currentPrice.toFixed(4)}) — will execute immediately`,
      )
    }
    const dropPct = ((currentPrice - triggerPrice) / currentPrice) * 100
    if (dropPct > 50) {
      simulation.failureModes.push(
        `Trigger is ${dropPct.toFixed(0)}% below current price — very wide stop`,
      )
    }
  }

  const expiryDate = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString()

  const plan: ExecutionPlan = {
    planId: crypto.randomUUID(),
    goal: `Stop loss: sell ${args.amount} ${args.token} if price drops to $${args.triggerPrice}`,
    intent: 'stop_loss',
    chain: 'solana',
    protocol: 'cron-trigger',
    assetIn: { symbol: args.token, address: '', chain: 'solana' },
    assetOut: { symbol: outputToken, address: '', chain: 'solana' },
    amountIn: args.amount,
    amountInUsd: currentPrice ? amount * currentPrice : undefined,
    route: {
      provider: 'jupiter (on trigger)',
      expectedOutput: simulation.estimatedOutput,
      priceImpactBps: 0,
      slippageBps: 100,
      feesUsd: 0.005,
      minimumOutput: '0',
      routePath: [`${args.token} → ${outputToken} (stop loss @ $${args.triggerPrice})`],
    },
    routeCandidates: [],
    risk: {
      level: simulation.failureModes.length > 0 ? 'medium' : 'low',
      checks: [
        {
          name: 'trigger_vs_current',
          passed: !currentPrice || triggerPrice < currentPrice,
          detail: currentPrice
            ? `Current: $${currentPrice.toFixed(4)}, Trigger: $${triggerPrice} (${((1 - triggerPrice / currentPrice) * 100).toFixed(1)}% below)`
            : 'Current price unavailable',
        },
        {
          name: 'monitoring',
          passed: true,
          detail: `Checking every ${checkInterval} minutes for ${expiryHours} hours`,
        },
      ],
    },
    simulation,
    recommendedAction: simulation.failureModes.some(f => f.includes('immediately'))
      ? 'review'
      : 'execute',
    requiresConfirmation: true,
    summary: [
      `Stop Loss: ${args.token}`,
      `Amount: ${args.amount} ${args.token}`,
      `Trigger: sell when price ≤ $${args.triggerPrice}`,
      currentPrice ? `Current price: $${currentPrice.toFixed(4)}` : '',
      `Sell into: ${outputToken}`,
      `Monitor: every ${checkInterval} minutes`,
      `Expires: ${expiryDate}`,
    ].filter(Boolean).join('\n'),
    createdAt: new Date().toISOString(),
  }

  // Build the cron task prompt for the scheduler
  const cronPrompt = [
    `STOP LOSS MONITOR — Plan ID: ${plan.planId}`,
    `Check the price of ${args.token}. If it is at or below $${args.triggerPrice}, immediately execute:`,
    `dex_swap: sell ${args.amount} ${args.token} for ${outputToken} on Solana with 1% slippage.`,
    `After executing the swap, cancel this scheduled task.`,
    `If the price is above $${args.triggerPrice}, do nothing (the monitor continues).`,
  ].join('\n')

  return JSON.stringify({
    plan,
    cronConfig: {
      name: `stop-loss-${args.token}-${plan.planId.slice(0, 8)}`,
      task_prompt: cronPrompt,
      cron_expression: `*/${checkInterval} * * * *`,
      idempotency_key: `stop-loss-${plan.planId}`,
    },
    formatted: plan.summary,
  })
}
