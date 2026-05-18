/**
 * Built-In Agent Tools — Hardcoded service integrations.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE NOTE                                                  │
 * │                                                                    │
 * │ These are NOT dead code or migration leftovers. They are the       │
 * │ ACTIVE implementations called by BuiltInToolExecutor.ts.           │
 * │                                                                    │
 * │ The `lucid-trade` embedded MCP skill exists in the lucid-plugins   │
 * │ monorepo but does NOT yet wrap these services. When it does,       │
 * │ these files will be deleted and the skill will handle execution    │
 * │ via InMemoryTransport (~1-5ms, same performance as hardcoded).     │
 * │                                                                    │
 * │ Migration status:                                                  │
 * │   wallet_balance  → lucid-trade MCP  [NOT STARTED]                │
 * │   dex_get_quote   → lucid-trade MCP  [NOT STARTED]                │
 * │   hl_account_info → lucid-trade MCP  [NOT STARTED]                │
 * │   generate_content→ lucid-content MCP[NOT STARTED]                │
 * │   code_interpreter→ lucid-code MCP   [NOT STARTED]                │
 * │                                                                    │
 * │ The platform-tools/ wrappers (dex-swap.ts, wallet-transfer.ts,    │
 * │ hl-orders.ts) re-export from here — they are the same code.       │
 * │                                                                    │
 * │ Service dependencies:                                              │
 * │   services/dex/jupiter.ts  — Jupiter API (Solana swaps, keyless)  │
 * │   services/dex/oneinch.ts  — 1inch API (EVM swaps, needs key)    │
 * │   services/chain/          — RPC fallback, circuit breaker, cache │
 * │   services/session-signer/ — Privy signing proxy → Next.js API   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * See also:
 *   runtime-tools/  — Agent primitives (scheduler, messaging, subagent)
 *   platform-tools/ — Re-exports of elevated tools from this directory
 */

// ── Read-only blockchain tools ──────────────────────────────────────
// Active implementation. Target: lucid-trade embedded MCP skill.
export { toolWalletBalance } from './wallet.js'
export type { ToolCacheLike } from './wallet.js'
export { toolDexGetQuote, getCachedQuote } from './dex.js'
export type { DexServiceLike, DexGetQuoteDeps } from './dex.js'
export { toolHlAccountInfo, getHlMarketInfo } from '../../skills/hyperliquid/tools/hyperliquid.js'
export type { HlAccountInfoContext } from '../../skills/hyperliquid/tools/hyperliquid.js'

// ── Content generation ── EXTRACTED to @lucid-fdn/content
// ── Code interpreter ──── EXTRACTED to @lucid-fdn/code-interpreter

// Re-export types
export type { SupportedChain, SwapQuote, SwapResult } from '../../services/dex/types.js'
export type { ToolContext, AgentWalletEntry } from './types.js'
