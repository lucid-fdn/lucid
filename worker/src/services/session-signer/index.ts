/**
 * Session Signer Service for Worker
 *
 * Handles autonomous transaction signing and broadcasting.
 * Calls the internal API endpoint for actual signing operations.
 */

import { getConfig } from '../../config.js'
import { redact, redactObject } from '../../utils/pii-redactor.js'

// ============================================================================
// Types
// ============================================================================

export type ChainType = 'ethereum' | 'solana'
export type SupportedChain = 'ethereum' | 'solana' | 'base' | 'polygon' | 'arbitrum'

export interface EVMTransactionRequest {
  chainType: 'ethereum'
  chainId?: string
  to: string
  value?: string
  data?: string
  gasLimit?: string
  gasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  nonce?: number
}

export interface SolanaTransactionRequest {
  chainType: 'solana'
  chainId?: string
  serializedTransaction: string
}

export type TransactionRequest = EVMTransactionRequest | SolanaTransactionRequest

export interface ExecutionResult {
  success: boolean
  txHash?: string
  error?: string
  blockNumber?: number
}

export interface SessionSignerStatus {
  enabled: boolean
  chainType: ChainType
  chainId?: string
}

// ============================================================================
// API Configuration
// ============================================================================

function getApiBaseUrl(): string {
  // The main Next.js app runs the session signer API
  // In production, this would be the internal URL of the main app
  return process.env.NEXTJS_INTERNAL_URL || process.env.LUCID_APP_URL || 'http://localhost:3000'
}

function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Add internal service auth if configured
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET
  if (internalSecret) {
    headers['X-Internal-Service-Secret'] = internalSecret
  }

  return headers
}

// ============================================================================
// Session Signer Status
// ============================================================================

/**
 * Check if a user has session signer enabled for a wallet and chain
 */
export async function hasSessionSignerEnabled(
  userId: string,
  walletAddress: string,
  chainType: ChainType = 'ethereum'
): Promise<boolean> {
  try {
    const baseUrl = getApiBaseUrl()
    const params = new URLSearchParams({
      address: walletAddress,
      chainType,
    })

    const response = await fetch(`${baseUrl}/api/wallet/session-signer/status?${params}`, {
      headers: getApiHeaders(),
    })

    if (!response.ok) {
      console.warn('[SessionSigner] Safe status check failed:', response.status)
      return false
    }

    const data = (await response.json()) as { chainStatus?: Record<string, { enabled?: boolean }> }
    return data.chainStatus?.[chainType]?.enabled === true
  } catch (error) {
    console.error('[SessionSigner] Error checking status:', redact(error instanceof Error ? error.message : String(error)))
    return false
  }
}

// ============================================================================
// Transaction Execution
// ============================================================================

/**
 * Execute an EVM transaction through the session signer
 */
export async function executeEVMTransaction(
  userId: string,
  walletAddress: string,
  transaction: EVMTransactionRequest
): Promise<ExecutionResult> {
  console.log('[SessionSigner] Executing EVM transaction', redactObject({
    userId,
    walletAddress,
    to: transaction.to,
    chainId: transaction.chainId,
  }))

  try {
    const baseUrl = getApiBaseUrl()

    const response = await fetch(`${baseUrl}/api/internal/trading/execute`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        userId,
        walletAddress,
        transaction: {
          ...transaction,
          chainType: 'ethereum',
        },
      }),
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      console.error('[SessionSigner] EVM execution failed:', response.status, redactObject(errorData))
      return {
        success: false,
        error: errorData.error || `Execution failed: ${response.statusText}`,
      }
    }

    const result = (await response.json()) as ExecutionResult

    console.log('[SessionSigner] EVM transaction executed:', redactObject({
      success: result.success,
      txHash: result.txHash,
    }))

    return result
  } catch (error) {
    console.error('[SessionSigner] Error executing EVM transaction:', redact(error instanceof Error ? error.message : String(error)))
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute transaction',
    }
  }
}

/**
 * Execute a Solana transaction through the session signer
 */
export async function executeSolanaTransaction(
  userId: string,
  walletAddress: string,
  transaction: SolanaTransactionRequest
): Promise<ExecutionResult> {
  console.log('[SessionSigner] Executing Solana transaction', redactObject({
    userId,
    walletAddress,
    chainId: transaction.chainId,
  }))

  try {
    const baseUrl = getApiBaseUrl()

    const response = await fetch(`${baseUrl}/api/internal/trading/execute`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        userId,
        walletAddress,
        transaction: {
          ...transaction,
          chainType: 'solana',
        },
      }),
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      console.error('[SessionSigner] Solana execution failed:', response.status, redactObject(errorData))
      return {
        success: false,
        error: errorData.error || `Execution failed: ${response.statusText}`,
      }
    }

    const result = (await response.json()) as ExecutionResult

    console.log('[SessionSigner] Solana transaction executed:', redactObject({
      success: result.success,
      txHash: result.txHash,
    }))

    return result
  } catch (error) {
    console.error('[SessionSigner] Error executing Solana transaction:', redact(error instanceof Error ? error.message : String(error)))
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute transaction',
    }
  }
}

/**
 * Execute a transaction (auto-detects chain type)
 */
export async function executeTransaction(
  userId: string,
  walletAddress: string,
  transaction: TransactionRequest
): Promise<ExecutionResult> {
  if (transaction.chainType === 'solana') {
    return executeSolanaTransaction(userId, walletAddress, transaction)
  }
  return executeEVMTransaction(userId, walletAddress, transaction)
}

/**
 * Execute a transaction using the agent's own wallet (server-owned).
 * Bypasses session_signer_permissions — wallet is derived from agent_wallets table.
 */
export async function executeAgentWalletTransaction(
  assistantId: string,
  transaction: TransactionRequest
): Promise<ExecutionResult> {
  console.log('[SessionSigner] Executing agent wallet transaction', redactObject({
    assistantId,
    chainType: transaction.chainType,
  }))

  try {
    const baseUrl = getApiBaseUrl()

    const payload = JSON.stringify({
      assistantId,
      transactionRequest: transaction,
      useAgentWallet: true,
    })

    console.log('[SessionSigner] Agent wallet -> /api/internal/trading/execute', redactObject({
      assistantId,
      chainType: transaction.chainType,
      baseUrl,
    }))

    const response = await fetch(`${baseUrl}/api/internal/trading/execute`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: payload,
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
      console.error('[SessionSigner] Agent wallet execution failed', redactObject({
        status: response.status,
        error: errorData.error,
        code: errorData.code,
        assistantId,
      }))
      return {
        success: false,
        error: errorData.error || `Agent wallet execution failed: ${response.statusText}`,
      }
    }

    return (await response.json()) as ExecutionResult
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute agent wallet transaction',
    }
  }
}

// ============================================================================
// EIP-712 Typed Data Signing (for x402 protocol)
// ============================================================================

/**
 * Sign EIP-712 typed data using the agent's wallet.
 * Proxies to the main app's internal sign-typed-data endpoint.
 */
export async function signAgentWalletTypedData(
  assistantId: string,
  typedData: Record<string, unknown>
): Promise<{ success: boolean; signature?: string; address?: string; error?: string }> {
  try {
    const baseUrl = getApiBaseUrl()

    const response = await fetch(`${baseUrl}/api/internal/trading/sign-typed-data`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        assistantId,
        typedData,
      }),
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      return {
        success: false,
        error: errorData.error || `Sign typed data failed: ${response.statusText}`,
      }
    }

    return (await response.json()) as { success: boolean; signature?: string; address?: string }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sign typed data',
    }
  }
}

// ============================================================================
// Chain Utilities
// ============================================================================

/**
 * Map supported chain to chain type
 */
export function getChainType(chain: SupportedChain): ChainType {
  if (chain === 'solana') return 'solana'
  return 'ethereum'
}

/**
 * Get chain ID for a supported chain
 */
export function getChainId(chain: SupportedChain): string {
  const chainIds: Record<SupportedChain, string> = {
    ethereum: '1',
    base: '8453',
    polygon: '137',
    arbitrum: '42161',
    solana: 'mainnet-beta',
  }
  return chainIds[chain]
}
