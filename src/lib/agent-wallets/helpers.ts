/**
 * Agent Wallet Helpers
 *
 * Pure functions for agent wallet configuration and prompt generation.
 * Kept separate from index.ts so they can be imported by tests and
 * the worker service without triggering the `server-only` guard.
 */

// ============================================================================
// Constants
// ============================================================================

/** @deprecated Use TRADING_CAPABILITIES_DEFI_ONLY instead */
export const TRADING_TOOLS_DEFI_ONLY = [
  'wallet_balance',
  'dex_get_quote',
  'dex_swap',
  'hl_account_info',
  'hl_place_order',
  'hl_cancel_order',
]

/** @deprecated Use TRADING_CAPABILITIES_WITH_TRANSFER instead */
export const TRADING_TOOLS_WITH_TRANSFER = [
  ...TRADING_TOOLS_DEFI_ONLY,
  'wallet_transfer',
]

/**
 * Capabilities granted when enabling a wallet (defi_only mode).
 * Maps to tools via CAPABILITY_TOOLS in CommandsAllowlist.ts.
 * Adding a new tool only requires updating the capability map — not every assistant.
 */
export const TRADING_CAPABILITIES_DEFI_ONLY = [
  'execute:swap',
  'execute:perpetuals',
  'execute:orders',
  'execute:predictions',
  'execute:predictions_automation',
]

/** Capabilities granted when enabling a wallet (with_transfer mode). */
export const TRADING_CAPABILITIES_WITH_TRANSFER = [
  ...TRADING_CAPABILITIES_DEFI_ONLY,
  'execute:transfer',
]

// ============================================================================
// Types
// ============================================================================

export interface AgentWallet {
  id: string
  assistant_id: string
  org_id: string
  chain_type: 'ethereum' | 'solana'
  privy_wallet_id: string
  address: string
  privy_policy_id: string | null
  withdrawal_address: string | null
  status: 'creating' | 'active' | 'frozen' | 'archived'
  created_at: string
  updated_at: string
}

export interface EnableWalletParams {
  assistantId: string
  orgId: string
  withdrawalAddressEvm?: string
  withdrawalAddressSolana?: string
}

export interface EnableWalletResult {
  success: boolean
  evm?: { address: string; walletId: string }
  solana?: { address: string; walletId: string }
  error?: string
}

// ============================================================================
// Helpers
// ============================================================================

export function buildDefaultTradingPolicy(assistantId: string) {
  return {
    assistant_id: assistantId,
    enabled: true,
    max_trade_value_usd: 50,
    daily_limit_usd: 200,
    allowed_chains: ['1', '8453', '42161', 'mainnet-beta'],
    allowed_tokens: {
      ethereum: ['ETH', 'USDC', 'USDT', 'WETH', 'DAI'],
      solana: ['SOL', 'USDC'],
    },
    max_slippage_bps: 100,
    transfer_mode: 'defi_only' as const,
  }
}

export function buildWalletPromptBlock(
  wallets: Array<{ chain_type: string; address: string; status: string }>
): string {
  const active = wallets.filter((w) => w.status === 'active')
  if (active.length === 0) return ''

  const evm = active.find((w) => w.chain_type === 'ethereum')
  const sol = active.find((w) => w.chain_type === 'solana')

  const lines = ['\n\n## Your Wallets']
  if (evm) lines.push(`- EVM (Ethereum/Base/Arbitrum): ${evm.address}`)
  if (sol) lines.push(`- Solana: ${sol.address}`)
  lines.push('Use these addresses when executing trades or checking balances.')
  lines.push('Never ask the user for a wallet address -- use your own.')

  return lines.join('\n')
}
