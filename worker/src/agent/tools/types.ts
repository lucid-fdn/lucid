/**
 * ToolContext — Shared execution context for built-in agent tools.
 *
 * Used by both read-only tools (wallet_balance, dex_get_quote, etc.)
 * and elevated platform tools (dex_swap, wallet_transfer, etc.).
 *
 * PlatformToolContext in platform-tools/types.ts is structurally identical
 * — kept separate for import clarity. When the read-only tools migrate to
 * the lucid-trade MCP skill, this file will be deleted and only
 * PlatformToolContext will remain.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AgentWalletEntry {
  address: string
  privyWalletId: string
}

/**
 * Context passed to built-in tool functions at execution time.
 *
 * `agentWallets` is populated when `wallet_enabled=true` on the assistant.
 * Tool functions should prefer `agentWallets` over any wallet address supplied
 * in the tool args (which may not even be present after schema stripping).
 */
export interface ToolContext {
  supabase: SupabaseClient
  userId: string
  assistantId: string
  runId?: string
  toolCallId?: string
  agentWallets?: {
    evm?: AgentWalletEntry
    solana?: AgentWalletEntry
  }
  /** Organization ID for multi-tenant operations */
  orgId?: string
  /** Legacy session-signer wallet address (used when agentWallets is not set) */
  fromAddress?: string
  /** x402-wrapped fetch — auto-pays for 402-protected APIs using the agent's wallet */
  x402Fetch?: (url: string, init?: RequestInit) => Promise<Response>
}
