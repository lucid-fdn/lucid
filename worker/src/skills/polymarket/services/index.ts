/**
 * Polymarket Service — Prediction market trading on Polygon.
 *
 * Provides:
 *   - Market data (Gamma REST API)
 *   - Order management (CLOB REST API with EIP-712 auth)
 *   - On-chain CTF operations (split/merge via Privy agent wallet)
 *   - Trade execution (orchestrated CLOB + CTF)
 *
 * Consumed by:
 *   platform-tools/polymarket-trade.ts → polymarket_trade (elevated)
 *
 * Auth: All signing via Privy HSM (signAgentWalletTypedData + executeAgentWalletTransaction).
 * No private keys in code or env vars.
 */

export * from './types.js'
export * from './constants.js'
export * from './errors.js'
export {
  getMarket,
  searchMarkets,
  getOrderbook,
  getOrderbooks,
  placeOrder,
  cancelOrder,
  cancelOrders,
  cancelAll,
  cancelMarketOrders,
  getOpenOrders,
  getPrice,
  getPrices,
  getMidpoint,
  getMidpoints,
  getSpread,
  getSpreads,
  getLastTradePrice,
  getPriceHistory,
  getTickSize,
  getNegRisk,
  getFeeRateBps,
  getDataApiPositions,
  buildSignedOrder,
  _clearClobCache,
} from './clob-client.js'
export {
  splitPosition,
  mergePositions,
  redeemPositions,
  ensureUsdcApproval,
  ensureCtfApproval,
} from './ctf-executor.js'
export {
  executePolymarketTrade,
  splitAndSell,
} from './trade-executor.js'
export { encodeFunctionData, parseUnits } from './abi-utils.js'
export { fetchWithRetry } from './fetch-retry.js'
export { readCtfBalance } from './balance-reader.js'
export { logPolymarketTrade } from './trade-logger.js'
export { getPositions } from './position-aggregator.js'
export {
  evaluateRule,
  isInCooldown,
  isMaxTriggersReached,
  isInBackoff,
  isPortfolioRuleType,
  computePortfolioMetrics,
  evaluatePortfolioRule,
  evaluatePortfolioStopLoss,
  evaluatePortfolioTakeProfit,
  evaluateConcentrationGuard,
  evaluateExposureCap,
} from './automation-evaluator.js'
export {
  createRule,
  createPortfolioRule,
  listRules,
  updateRule,
  deleteRule,
  listExecutions,
  updateRuleState,
  validateRuleConfig,
} from './automation-rules.js'
