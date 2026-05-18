/**
 * Platform Tools — Elevated execution tools requiring in-process signing.
 *
 * These 4 tools execute financial transactions and MUST stay in-process:
 * - Privy wallet signing (server-side key material via session-signer → Next.js)
 * - TradingPolicyGuard enforcement (daily limits, confirmation thresholds)
 * - Audit logging (pending → submitted/failed transaction recording)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE NOTE                                                  │
 * │                                                                    │
 * │ These are thin re-exports from tools/*.ts where the actual         │
 * │ implementations live. This layer exists for import clarity:        │
 * │                                                                    │
 * │   BuiltInToolExecutor.ts                                          │
 * │     ├── imports from runtime-tools/  (agent primitives)           │
 * │     ├── imports from platform-tools/ (THIS — elevated trading)    │
 * │     └── imports from tools/          (read-only + content)        │
 * │                                                                    │
 * │ Unlike the read-only tools in tools/, these CANNOT become MCP     │
 * │ plugins because they require:                                      │
 * │   1. In-process Privy session signing context                     │
 * │   2. TradingPolicyGuard with DB access                            │
 * │   3. Transaction recording for audit trail                        │
 * │                                                                    │
 * │ The underlying services (services/dex/, services/chain/) are      │
 * │ shared between platform tools and the read-only tools.            │
 * └─────────────────────────────────────────────────────────────────────┘
 */

export { toolWalletTransfer } from './wallet-transfer.js'
export { toolDexSwap } from './dex-swap.js'
export { toolHlPlaceOrder, toolHlCancelOrder, toolHlDeposit, toolHlWithdraw } from './hl-orders.js'
export { toolBridgeExecute } from '../../skills/debridge/tools/bridge-execute.js'
export { toolPolymarketTrade } from '../../skills/polymarket/tools/trade.js'

// Types
export type { PlatformToolContext, AgentWalletEntry } from './types.js'
