/**
 * Polymarket Predictions — prediction-specific constants.
 *
 * Generic trading formatters/colors live in @/lib/trading/format.
 */

// Re-export shared trading helpers (consumers can import from either place)
export {
  formatProbability,
  formatUsd,
  formatPnlPercent,
  formatShares,
  pnlColor,
  pnlBgColor,
  probabilityColor,
  orderSideColor,
  marketStatusColor,
  ORDER_TYPE_LABELS,
} from '@/lib/trading/format'

// ── Predictions-specific constants ──

/** Polling interval for positions/orders (ms) */
export const PREDICTIONS_POLL_INTERVAL = 15_000

/** Polling interval for orderbook (ms) */
export const ORDERBOOK_POLL_INTERVAL = 5_000

/** Max markets returned from search */
export const SEARCH_RESULT_LIMIT = 10

export const EMPTY_STATES = {
  positions: 'No open positions',
  orders: 'No pending orders',
  search: 'Search for prediction markets',
  noResults: 'No markets found',
} as const
