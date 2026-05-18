/**
 * Platform Tool Types — context for elevated execution tools.
 *
 * These tools need in-process Privy wallet signing and TradingPolicyGuard.
 * They CANNOT be plugins because they require server-side key material.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AgentWalletEntry {
  address: string
  privyWalletId: string
}

/**
 * Context for platform tools that perform financial transactions.
 * Includes wallet signing context that MUST stay server-side.
 */
export interface PlatformToolContext {
  supabase: SupabaseClient
  userId: string
  assistantId: string
  runId?: string
  toolCallId?: string
  agentWallets?: {
    evm?: AgentWalletEntry
    solana?: AgentWalletEntry
  }
  /** x402-wrapped fetch — auto-pays for 402-protected APIs using the agent's wallet */
  x402Fetch?: (url: string, init?: RequestInit) => Promise<Response>
}
