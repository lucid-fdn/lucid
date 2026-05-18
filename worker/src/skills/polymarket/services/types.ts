/**
 * Polymarket Service Types
 * Shared types for Polymarket CLOB + CTF interactions on Polygon.
 */

// ============================================================================
// Market Data (Gamma API)
// ============================================================================

export interface PolymarketMarket {
  condition_id: string
  question_id: string
  tokens: PolymarketToken[]
  question: string
  description: string
  end_date_iso: string
  game_start_time?: string
  active: boolean
  closed: boolean
  archived: boolean
  accepting_orders: boolean
  minimum_order_size: string
  minimum_tick_size: string
  neg_risk: boolean
}

export interface PolymarketToken {
  token_id: string
  outcome: string // 'Yes' | 'No'
  price: number
  winner: boolean
}

// ============================================================================
// CLOB API (Order Placement)
// ============================================================================

export type ClobOrderSide = 'BUY' | 'SELL'
export type ClobOrderType = 'GTC' | 'FOK' | 'GTD' | 'FAK'

export interface ClobOrderRequest {
  tokenId: string
  side: ClobOrderSide
  price: number
  size: number
  orderType: ClobOrderType
  /** Expiration timestamp (seconds) for GTD orders */
  expiration?: number
  /** Nonce for signature replay protection */
  nonce?: number
  /** Post-only flag — order rejected if it would match immediately */
  postOnly?: boolean
  /** Neg-risk market — determines which exchange contract to use */
  negRisk?: boolean
  /** Fee rate in basis points (fetched from CLOB API) */
  feeRateBps?: number
}

export interface ClobOrderResponse {
  success: boolean
  orderID?: string
  transactID?: string
  status?: string
  error?: string
}

// ── Signed Order (EIP-712) ──

/** On-chain order struct matching @polymarket/order-utils */
export interface SignedOrder {
  salt: string
  maker: string
  signer: string
  taker: string
  tokenId: string
  makerAmount: string
  takerAmount: string
  expiration: string
  nonce: string
  feeRateBps: string
  side: number
  signatureType: number
  signature: string
}

/** POST /order payload */
export interface ClobPostOrderPayload {
  order: SignedOrder
  order_type: ClobOrderType
  owner: string
  client_order_id?: string
  defer_exec?: boolean
  post_only?: boolean
}

// ── Batch Operations ──

export interface BatchBookParams {
  token_id: string
}

export interface PriceHistoryPoint {
  t: number // timestamp
  p: string // price
}

// ── Data API ──

export interface DataApiPosition {
  asset: string
  conditionId: string
  size: string
  avgPrice: string
  curPrice: string
  initialValue: string
  currentValue: string
  pnl: string
  percentPnl: string
  outcome: string
  outcomeIndex: number
}

export interface ClobOrderbook {
  market: string
  asset_id: string
  timestamp: string
  bids: ClobOrderbookLevel[]
  asks: ClobOrderbookLevel[]
  hash: string
}

export interface ClobOrderbookLevel {
  price: string
  size: string
}

export interface ClobOpenOrder {
  id: string
  status: string
  market: string
  asset_id: string
  side: ClobOrderSide
  original_size: string
  size_matched: string
  price: string
  created_at: string
  expiration: string
  order_type: ClobOrderType
}

// ============================================================================
// CTF (Conditional Token Framework — On-Chain)
// ============================================================================

export interface CtfSplitParams {
  conditionId: string
  amount: string // In USDC.e units (6 decimals)
}

export interface CtfMergeParams {
  conditionId: string
  amount: string // In outcome token units
}

export interface CtfOperationResult {
  success: boolean
  txHash?: string
  error?: string
}

// ============================================================================
// Trade Execution (Orchestrated)
// ============================================================================

export type PolymarketTradeAction = 'buy_yes' | 'buy_no' | 'sell_yes' | 'sell_no'

export interface PolymarketTradeParams {
  /** Condition ID of the market */
  conditionId: string
  /** What to do */
  action: PolymarketTradeAction
  /** Amount in USDC (for buys) or outcome tokens (for sells) */
  amount: string
  /** Limit price (0-1 range). If omitted, uses FOK at current price. */
  limitPrice?: number
}

export interface PolymarketTradeResult {
  success: boolean
  action: PolymarketTradeAction
  conditionId: string
  amount: string
  /** Order ID from CLOB (if order route) */
  orderId?: string
  /** Tx hash (if on-chain route) */
  txHash?: string
  /** Effective price achieved */
  effectivePrice?: number
  error?: string
}

// ============================================================================
// Position Tracking
// ============================================================================

export interface PolymarketPosition {
  conditionId: string
  tokenId: string
  outcome: string
  size: string
  avgPrice: number
  currentPrice: number
  pnlUsd: number
  pnlPercent: number
}

// ============================================================================
// Automation (Phase 5A — Protective Alerts + Phase 5C — Portfolio)
// ============================================================================

export type AutomationRuleType =
  | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'time_exit'
  | 'portfolio_stop_loss' | 'portfolio_take_profit' | 'concentration_guard' | 'exposure_cap'

export type AutomationRuleScope = 'position' | 'portfolio'
export type AutomationExitAction = 'sell_yes' | 'sell_no'
export type AutomationDisabledReason = 'user' | 'max_triggers' | 'failures'
export type AutomationExecutionMode = 'approval' | 'auto_execute'

export type AutomationExecutionStatus =
  | 'pending_approval'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'executed'
  | 'failed'
  | 'below_minimum'
  | 'processing'
  | 'no_position'
  | 'market_unavailable'

/** Terminal non-failure statuses — do NOT increment consecutive_failures */
export const TERMINAL_NON_FAILURE_STATUSES: AutomationExecutionStatus[] = [
  'below_minimum', 'no_position', 'market_unavailable',
]

// ── Position rule configs ───────────────────────────────────────────

export interface StopLossConfig {
  threshold_price: number
}

export interface TakeProfitConfig {
  threshold_price: number
}

export interface TrailingStopConfig {
  trail_percent: number
}

export interface TimeExitConfig {
  exit_hours_before_close: number
}

// ── Portfolio rule configs (Phase 5C) ───────────────────────────────

export interface PortfolioStopLossConfig {
  threshold_pnl_percent: number
}

export interface PortfolioTakeProfitConfig {
  threshold_pnl_percent: number
}

export interface ConcentrationGuardConfig {
  max_concentration_pct: number
  target_concentration_pct?: number // default: max - 5
}

export interface ExposureCapConfig {
  max_exposure_usd: number
  target_exposure_usd?: number // default: max * 0.9
}

export type AutomationRuleConfig =
  | StopLossConfig
  | TakeProfitConfig
  | TrailingStopConfig
  | TimeExitConfig
  | PortfolioStopLossConfig
  | PortfolioTakeProfitConfig
  | ConcentrationGuardConfig
  | ExposureCapConfig

export interface TrailingStopState {
  high_water_mark: number
}

// ── Portfolio metrics & evaluation (Phase 5C) ───────────────────────

export interface PortfolioMetrics {
  totalPnlUsd: number
  totalPnlPercent: number
  totalExposureUsd: number
  totalCostBasis: number
  positionCount: number
  positions: PolymarketPosition[]
}

export interface PortfolioEvaluationResult {
  triggered: boolean
  triggerSnapshot: Record<string, unknown>
  affectedPositions: PortfolioAffectedPosition[]
}

export interface PortfolioAffectedPosition {
  conditionId: string
  tokenId: string
  outcome: string
  exitAction: AutomationExitAction
  exitAmount: number
  reason: string
}

export type BatchOutcome = 'full_success' | 'partial_success' | 'full_failure' | 'revalidation_passed' | 'pending'

// ── Rule & Execution interfaces ─────────────────────────────────────

export interface AutomationRule {
  id: string
  agent_id: string
  org_id: string
  scope: AutomationRuleScope
  condition_id: string | null
  token_id: string | null
  outcome: string | null
  rule_type: AutomationRuleType
  rule_config: AutomationRuleConfig
  rule_state: Record<string, unknown>
  exit_action: AutomationExitAction | null
  exit_amount_pct: number
  enabled: boolean
  disabled_reason: string | null
  cooldown_seconds: number
  max_triggers: number | null
  trigger_count: number
  last_triggered_at: string | null
  execution_mode: AutomationExecutionMode
  consecutive_failures: number
  last_failed_at: string | null
  created_at: string
  updated_at: string
}

export interface AutomationExecution {
  id: string
  rule_id: string
  agent_id: string
  org_id: string
  condition_id: string
  rule_type: string
  trigger_price: number | null
  threshold_value: number | null
  position_size: string | null
  status: AutomationExecutionStatus
  trade_result: Record<string, unknown> | null
  approval_id: string | null
  error_message: string | null
  execution_key: string | null
  trigger_batch_id: string | null
  trigger_snapshot: Record<string, unknown> | null
  created_at: string
}
