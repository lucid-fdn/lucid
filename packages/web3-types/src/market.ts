/**
 * Market Data Types
 */

import type { Asset } from './chain.js'

export interface TokenPrice {
  asset: Pick<Asset, 'symbol' | 'address' | 'chain'>
  /** Price in USD */
  priceUsd: number
  /** 24h change percentage */
  change24h?: number
  /** Volume 24h USD */
  volume24h?: number
  /** Market cap USD */
  marketCap?: number
  /** Source of the price data */
  source: 'jupiter' | 'dexscreener' | 'birdeye' | 'coingecko' | '0x'
  /** When the price was fetched */
  timestamp: string
}

export interface RouteCandidate {
  /** DEX / aggregator providing this route */
  provider: string
  /** Expected output amount in token units */
  expectedOutput: string
  /** Expected output in USD */
  expectedOutputUsd?: number
  /** Price impact in basis points */
  priceImpactBps: number
  /** Slippage tolerance in basis points */
  slippageBps: number
  /** Estimated fees (gas + protocol) in USD */
  feesUsd: number
  /** Minimum output after slippage */
  minimumOutput: string
  /** Route steps (e.g. "USDC → SOL via Jupiter") */
  routePath: string[]
}
