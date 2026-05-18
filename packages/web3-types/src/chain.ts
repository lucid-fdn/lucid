/**
 * Chain & Asset Primitives
 */

export type Chain = 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum'

export interface Asset {
  /** Token symbol (e.g. "SOL", "USDC", "ETH") */
  symbol: string
  /** On-chain address / mint */
  address: string
  /** Chain where this asset lives */
  chain: Chain
  /** Decimal places */
  decimals: number
}

export interface TokenInfo extends Asset {
  name: string
  /** Logo URL if available */
  logoUri?: string
  /** CoinGecko / Jupiter ID for price lookups */
  priceId?: string
  /** Safety / risk flags */
  safety?: TokenSafety
}

export interface TokenSafety {
  /** Overall risk level */
  risk: 'safe' | 'warning' | 'danger' | 'unknown'
  /** Individual flags */
  flags: string[]
  /** e.g. "Freeze authority enabled", "Low liquidity" */
  warnings: string[]
}
