/**
 * Privy Signer Adapter
 *
 * Wraps Privy-based signing (session signer + agent wallet) into the
 * provider-agnostic TransactionSigner interface from @lucid-fdn/agent-tools-core.
 *
 * Two signing paths:
 *   1. Agent wallet (server-owned) — uses executeAgentWalletTransaction
 *   2. Session signer (user-delegated) — uses executeTransaction
 *
 * The adapter converts from the core TransactionRequest (chain discriminant)
 * to the session-signer legacy format (chainType discriminant).
 */

import type { TransactionSigner, TransactionRequest } from '@lucid-fdn/agent-tools-core'
import {
  executeTransaction,
  executeAgentWalletTransaction,
  signAgentWalletTypedData,
} from '../../services/session-signer/index.js'
import type { TransactionRequest as LegacyTransactionRequest } from '../../services/session-signer/index.js'

// ── Types ─────────────────────────────────────────────────────────────

export interface PrivySignerParams {
  /** Assistant ID — used for agent wallet signing */
  assistantId: string
  /** User ID — used for session signer (user-delegated) path */
  userId: string
  /** Whether the assistant has agent wallets configured */
  hasAgentWallets: boolean
  /** Legacy session-signer wallet address (fallback when no agent wallets) */
  fromAddress?: string
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Convert a core TransactionRequest (chain discriminant: 'evm' | 'solana')
 * to the session-signer legacy format (chainType discriminant: 'ethereum' | 'solana').
 */
function toLegacyTransaction(tx: TransactionRequest): LegacyTransactionRequest {
  if (tx.chain === 'solana') {
    return {
      chainType: 'solana' as const,
      serializedTransaction: tx.serializedTransaction,
    }
  }
  return {
    chainType: 'ethereum' as const,
    chainId: tx.chainId,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gasLimit: tx.gasLimit,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    nonce: tx.nonce,
  }
}

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Create a provider-agnostic TransactionSigner backed by Privy.
 *
 * Routes to agent wallet (server-owned) or session signer (user-delegated)
 * based on whether agentWallets are configured on the assistant.
 */
export function createPrivySigner(params: PrivySignerParams): TransactionSigner {
  return {
    executeTransaction: async (tx) => {
      const legacyTx = toLegacyTransaction(tx)

      if (params.hasAgentWallets) {
        // Agent wallet path: server-owned wallet, no user delegation needed
        return executeAgentWalletTransaction(params.assistantId, legacyTx)
      }

      // Session signer path: user-delegated wallet
      return executeTransaction(params.userId, params.fromAddress || '', legacyTx)
    },

    signTypedData: async (typedData) => {
      // Widen EIP712TypedData -> Record<string, unknown> for the legacy session-signer API
      const raw: Record<string, unknown> = { ...typedData }
      return signAgentWalletTypedData(params.assistantId, raw)
    },
  }
}
