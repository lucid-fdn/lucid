/**
 * Execution Plan Types
 */

import type { Asset, Chain } from './chain.js'
import type { RouteCandidate } from './market.js'
import type { RiskAssessment } from './risk.js'

export type Intent =
  | 'swap'
  | 'limit_order'
  | 'dca'
  | 'stop_loss'
  | 'transfer'
  | 'bridge'
  | 'stake'
  | 'unstake'
  | 'lend'
  | 'borrow'
  | 'repay'
  | 'claim'
  | 'provide_liquidity'
  | 'remove_liquidity'

/**
 * ExecutionPlan — The structured output of the Reason lane.
 *
 * This is what the skill produces. A privileged platform tool
 * (or the user) decides whether to execute it.
 */
export interface ExecutionPlan {
  /** Unique plan ID for tracking */
  planId: string
  /** What the user/agent wants to accomplish */
  goal: string
  /** The normalized intent */
  intent: Intent
  /** Target chain */
  chain: Chain
  /** Protocol/provider to use */
  protocol: string
  /** Asset going in */
  assetIn: Pick<Asset, 'symbol' | 'address' | 'chain'>
  /** Asset coming out */
  assetOut: Pick<Asset, 'symbol' | 'address' | 'chain'>
  /** Amount in (token units) */
  amountIn: string
  /** Amount in USD */
  amountInUsd?: number
  /** Best route from comparison */
  route: RouteCandidate
  /** All candidate routes considered */
  routeCandidates: RouteCandidate[]
  /** Risk assessment */
  risk: RiskAssessment
  /** Simulation result */
  simulation: SimulationResult
  /** Recommended next step */
  recommendedAction: 'execute' | 'review' | 'abort'
  /** Whether user confirmation is required (from policy) */
  requiresConfirmation: boolean
  /** Human-readable summary */
  summary: string
  /** Created at */
  createdAt: string
}

export interface SimulationResult {
  /** Whether simulation succeeded */
  success: boolean
  /** Estimated output after fees and slippage */
  estimatedOutput: string
  /** Estimated gas/fees in USD */
  estimatedFeesUsd: number
  /** Potential failure modes */
  failureModes: string[]
  /** Net value change in USD (positive = gain) */
  netValueChangeUsd?: number
}
