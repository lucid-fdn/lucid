/**
 * web3-operator — Simulation-first, execution-ready Web3 operator.
 *
 * Three lanes:
 *   Read   → observe wallet/portfolio/market state
 *   Reason → risk check, PnL tracking, route comparison
 *   Action → limit orders, DCA, stop loss (produces execution plans)
 *
 * Signing stays OUTSIDE this module (platform tools handle it).
 * Policy enforcement stays OUTSIDE this module (TradingPolicyGuard).
 */

// ── Read Lane ────────────────────────────────────────────────────────
export { toolGetPrice, getMultiplePrices, batchJupiterPrices } from './read/index.js'
export { toolSearchToken, checkTokenSafety } from './read/index.js'
export { toolGetPortfolio } from './read/index.js'
export { toolGetQuote0x, toolSwapQuote0x } from './read/index.js'
export { toolGetWalletHistory } from './read/index.js'

// ── Reason Lane ──────────────────────────────────────────────────────
export { evaluateRisk, toolRiskCheck } from './reason/index.js'
export { createSnapshot, getSnapshots, calculatePnL, toolPortfolioSnapshot, toolGetPnL } from './reason/index.js'

// ── Action Lane ──────────────────────────────────────────────────────
export { toolLimitOrder } from './action/index.js'
export { toolDCACreate } from './action/index.js'
export { toolStopLoss } from './action/index.js'
export { toolBridge } from './action/index.js'

// ── Shared ──────────────────────────────────────────────────────────
export { SOLANA_TOKEN_MAP, EVM_TOKEN_MAP, EVM_CHAIN_IDS, resolveTokenAddress } from './shared/token-constants.js'
export {
  PROVIDERS,
  FALLBACK_CHAINS,
  providerUrl,
  getFallbackChain,
  withFallback,
  getProviderHealth,
  resetBreaker,
  jupiter,
  dexscreener,
  zerox,
  helius,
  debridge,
  buildHostLimits,
  warnIfMissing,
} from './shared/providers.js'
export type { ProviderId, Capability } from './shared/providers.js'

// ── Schemas ─────────────────────────────────────────────────────────
export { WEB3_OPERATOR_SCHEMAS } from './schemas.js'

// ── Config ──────────────────────────────────────────────────────────
export { initWeb3Operator, getConfig, isInitialized } from './config.js'
export type { Web3OperatorConfig, SnapshotStore, ToolCacheInterface, ResolvedConfig } from './config.js'

// ── Types (re-exported from @lucid-fdn/web3-types) ──────────────────
export type {
  Chain,
  Asset,
  TokenInfo,
  TokenSafety,
  TokenBalance,
  TokenPrice,
  PortfolioState,
  PortfolioSnapshot,
  PnLReport,
  RouteCandidate,
  RiskAssessment,
  RiskCheck,
  ExecutionPlan,
  SimulationResult,
  Intent,
} from '@lucid-fdn/web3-types'
