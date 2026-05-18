/**
 * Portfolio & Balance Types
 */

import type { Asset, Chain } from './chain.js'

export interface TokenBalance {
  asset: Asset
  /** Raw balance in token units */
  balance: string
  /** USD value (null if price unavailable) */
  valueUsd: number | null
}

export interface PortfolioState {
  /** Wallet address */
  wallet: string
  /** Chain or "all" */
  chain: Chain | 'all'
  /** All non-zero balances */
  balances: TokenBalance[]
  /** Total portfolio value in USD */
  totalValueUsd: number
  /** Timestamp of this snapshot */
  timestamp: string
}

export interface PortfolioSnapshot {
  /** Snapshot ID */
  id: string
  /** Assistant/agent ID */
  assistantId: string
  /** Wallet address */
  wallet: string
  /** Full portfolio state at snapshot time */
  state: PortfolioState
  /** Label (e.g. "competition_start", "daily_checkpoint") */
  label?: string
  /** When this snapshot was taken */
  createdAt: string
}

export interface PnLReport {
  /** Reference snapshot (start) */
  startSnapshot: PortfolioSnapshot
  /** Current portfolio state */
  currentState: PortfolioState
  /** Absolute PnL in USD */
  pnlUsd: number
  /** Percentage return */
  pnlPercent: number
  /** Per-asset breakdown */
  assetBreakdown: Array<{
    symbol: string
    chain: Chain
    startValue: number
    currentValue: number
    pnlUsd: number
    pnlPercent: number
  }>
  /** Duration in seconds */
  durationSeconds: number
  /** Best performing asset */
  bestPerformer?: string
  /** Worst performing asset */
  worstPerformer?: string
}
