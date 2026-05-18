/**
 * Polymarket Predictions — UI types.
 *
 * Mirrors worker service types but adds display-specific fields.
 * These types are used by components and API routes on the Next.js side.
 */

// ── Market ──

export interface PredictionMarket {
  conditionId: string
  questionId: string
  question: string
  description: string
  endDate: string
  active: boolean
  closed: boolean
  acceptingOrders: boolean
  negRisk: boolean
  minOrderSize: string
  yesPrice: number
  noPrice: number
  yesTokenId: string
  noTokenId: string
}

// ── Orderbook ──

export interface OrderbookLevel {
  price: string
  size: string
}

export interface Orderbook {
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  spread: string
  midPrice: number | null
}

// ── Orders ──

export type OrderSide = 'BUY' | 'SELL'
export type OrderType = 'GTC' | 'FOK' | 'GTD'
export type OrderStatus = 'open' | 'matched' | 'cancelled'

export interface OpenOrder {
  id: string
  status: string
  market: string
  assetId: string
  side: OrderSide
  originalSize: string
  sizeMatched: string
  price: string
  createdAt: string
  expiration: string
  orderType: OrderType
}

// ── Positions ──

export interface Position {
  conditionId: string
  question: string
  outcome: 'Yes' | 'No'
  tokenId: string
  size: string
  avgEntryPrice: number
  currentPrice: number
  pnlUsd: number
  pnlPercent: number
  marketActive: boolean
}

// ── Dashboard State ──

export interface PredictionsDashboardData {
  positions: Position[]
  openOrders: OpenOrder[]
  markets: PredictionMarket[]
}

// ── API Response Shapes ──

export interface PredictionsApiResponse {
  positions: Position[]
  openOrders: OpenOrder[]
  error?: string
}

export interface MarketSearchResponse {
  markets: PredictionMarket[]
  error?: string
}

export interface CancelOrderResponse {
  success: boolean
  error?: string
}

// ── Bridge / Funding ──

export interface FundingInfo {
  /** Solana deposit address (send USDC/SOL here to fund the agent) */
  solanaDepositAddress: string
  /** EVM deposit address (Ethereum, Polygon, Arbitrum, Base, etc.) */
  evmDepositAddress: string
  /** Bitcoin deposit address */
  btcDepositAddress: string
  /** Note from Bridge API about supported chains/tokens */
  note: string
}

export interface FundingApiResponse {
  funding: FundingInfo
  error?: string
}

export interface WithdrawApiRequest {
  /** Destination Solana address */
  recipientAddress: string
  /** Amount in USDC to withdraw */
  amount: string
}

export interface WithdrawApiResponse {
  success: boolean
  /** Address to send USDC.e to for withdrawal */
  withdrawAddress?: string
  note?: string
  error?: string
}
