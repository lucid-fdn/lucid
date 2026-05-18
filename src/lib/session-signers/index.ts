/**
 * Session Signers Service
 *
 * Handles autonomous transaction signing using Privy's server SDK
 * with AuthorizationContext for secure key-quorum signing.
 *
 * Key design decisions:
 * - Uses PrivyClient.walletApi with authorizationPrivateKey (NOT manual REST + Basic auth)
 * - Wallet operations keyed by privy_wallet_id (NOT address alone)
 * - All signing operations go through the SDK's AuthorizationContext flow
 * - Supports both EVM and Solana chains
 *
 * @privy-io/server-auth v1.32+ — standardized on one supported server SDK path
 */

import 'server-only'
import { PrivyClient } from '@privy-io/server-auth'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { VersionedTransaction } from '@solana/web3.js'
import { ErrorService } from '@/lib/errors/error-service'
import { maskWalletAddress, summarizeError } from '@/lib/logging/safe-log'

// ============================================================================
// Types
// ============================================================================

/** Shape of Privy wallet API sign-transaction response */
interface PrivySignTransactionResponse {
  data?: { signed_transaction?: string }
  signed_transaction?: string
}

interface PrivySendTransactionResponse {
  data?: { hash?: string; caip2?: string }
  hash?: string
  method?: string
}

/** Privy wallet API sign-typed-data response */
interface PrivySignTypedDataResponse {
  data?: { signature?: string }
  signature?: string
}

/** Privy wallet API methods — SDK v1.32+ uses single-object args with walletId inside */
interface PrivyWalletApi {
  walletApi: {
    ethereum: {
      signTransaction: (args: Record<string, unknown>) => Promise<PrivySignTransactionResponse>
      sendTransaction: (args: Record<string, unknown>) => Promise<PrivySendTransactionResponse>
      signTypedData: (args: Record<string, unknown>) => Promise<PrivySignTypedDataResponse>
    }
    solana: {
      signTransaction: (args: Record<string, unknown>) => Promise<PrivySignTransactionResponse>
      signAndSendTransaction: (args: Record<string, unknown>) => Promise<PrivySendTransactionResponse>
    }
  }
}

export type ChainType = 'ethereum' | 'solana'

export interface SessionSignerConfig {
  signerId: string
  policyIds?: string[]
}

/** EVM transaction request */
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

/** Solana transaction request */
export interface SolanaTransactionRequest {
  chainType: 'solana'
  chainId?: string
  serializedTransaction: string
}

export type TransactionRequest = EVMTransactionRequest | SolanaTransactionRequest

export interface SessionSignerPermission {
  id: string
  user_id: string
  wallet_address: string
  chain_type: ChainType
  chain_id: string | null
  privy_wallet_id: string | null
  enabled: boolean
  enabled_at: string | null
  revoked_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

const SESSION_SIGNER_PERMISSION_SELECT =
  'id, user_id, wallet_address, chain_type, chain_id, privy_wallet_id, enabled, enabled_at, revoked_at, expires_at, created_at, updated_at' as const

export interface BroadcastResult {
  success: boolean
  txHash?: string
  error?: string
  blockNumber?: number
}

// ============================================================================
// Clients — Singleton with lazy init
// ============================================================================

let _supabase: SupabaseClient | null = null
let _privy: PrivyClient | null = null

/** Service-role Supabase client (untyped — trading tables not in generated types) */
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

/**
 * Get PrivyClient configured with AuthorizationContext.
 *
 * The authorizationPrivateKey allows the SDK to cryptographically sign
 * wallet API requests — this replaces the manual Basic-auth + header approach.
 *
 * Required env vars:
 *   NEXT_PUBLIC_PRIVY_APP_ID
 *   PRIVY_APP_SECRET
 *   PRIVY_AUTHORIZATION_PRIVATE_KEY  (PEM-encoded secp256k1 key from Privy dashboard)
 */
function getPrivyClient(): PrivyClient {
  if (!_privy) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
    const appSecret = process.env.PRIVY_APP_SECRET
    const authorizationPrivateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY

    if (!appId || !appSecret) {
      throw new Error('[SessionSigners] NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET are required')
    }

    const walletApiConfig: Record<string, unknown> = {}

    if (authorizationPrivateKey) {
      walletApiConfig.authorizationPrivateKey = authorizationPrivateKey
    } else {
      console.warn(
        '[SessionSigners] Privy quorum key is not set — ' +
        'wallet API calls will fall back to app-level auth. ' +
        'Set the key for production AuthorizationContext signing.'
      )
    }

    _privy = new PrivyClient(appId, appSecret, {
      walletApi: walletApiConfig,
    } as Record<string, unknown>)
  }
  return _privy
}

// ============================================================================
// Internal Helpers (shared across sign/execute functions)
// ============================================================================

/** Build the EVM tx payload object from an EVMTransactionRequest. */
function buildEVMPayload(transaction: EVMTransactionRequest): Record<string, unknown> {
  const txPayload: Record<string, unknown> = {
    to: transaction.to,
    value: transaction.value || '0',
  }
  if (transaction.data) txPayload.data = transaction.data
  if (transaction.gasLimit) txPayload.gas = transaction.gasLimit
  if (transaction.maxFeePerGas) txPayload.maxFeePerGas = transaction.maxFeePerGas
  if (transaction.maxPriorityFeePerGas)
    txPayload.maxPriorityFeePerGas = transaction.maxPriorityFeePerGas
  if (transaction.nonce !== undefined) txPayload.nonce = transaction.nonce
  return txPayload
}

/** Deserialize a base64-encoded Solana transaction into a VersionedTransaction. */
function deserializeSolanaTx(serialized: string): VersionedTransaction {
  const txBuffer = Buffer.from(serialized, 'base64')
  return VersionedTransaction.deserialize(txBuffer)
}

/**
 * Verify session signer permission and resolve the Privy wallet identifier.
 * Throws an error string if permission is not granted.
 */
async function verifyAndResolveWallet(
  userId: string,
  walletAddress: string,
  chainType: ChainType
): Promise<{ walletIdentifier: string }> {
  const hasPermission = await hasSessionSignerEnabled(userId, walletAddress, chainType)
  if (!hasPermission) {
    throw `Session signer not enabled for this ${chainType === 'solana' ? 'Solana ' : ''}wallet`
  }
  const privyWalletId = await resolvePrivyWalletId(userId, walletAddress, chainType)
  return { walletIdentifier: privyWalletId || walletAddress }
}

/** Derive the CAIP-2 chain identifier for Solana networks. */
function getSolanaCaip2(chainId?: string): string {
  const solanaChainId = chainId || 'mainnet-beta'
  return `solana:${solanaChainId === 'mainnet-beta' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' : solanaChainId}`
}

// ============================================================================
// Permission Management
// ============================================================================

export async function hasSessionSignerEnabled(
  userId: string,
  walletAddress: string,
  chainType: ChainType = 'ethereum'
): Promise<boolean> {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('session_signer_permissions')
      .select('enabled, expires_at')
      .eq('user_id', userId)
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('chain_type', chainType)
      .eq('enabled', true)
      .is('revoked_at', null)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[SessionSigners] DB error checking permission:', summarizeError(error))
      return false
    }

    if (!data) return false

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      console.log('[SessionSigners] Permission expired for', maskWalletAddress(walletAddress))
      return false
    }

    return true
  } catch (error) {
    console.error('[SessionSigners] Error checking session signer:', summarizeError(error))
    return false
  }
}

export async function enableSessionSigner(
  userId: string,
  walletAddress: string,
  chainType: ChainType = 'ethereum',
  chainId?: string,
  privyWalletId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days

    const { error } = await supabase
      .from('session_signer_permissions')
      .upsert(
        {
          user_id: userId,
          wallet_address: walletAddress.toLowerCase(),
          chain_type: chainType,
          chain_id: chainId || null,
          privy_wallet_id: privyWalletId || null,
          enabled: true,
          enabled_at: now.toISOString(),
          revoked_at: null,
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'user_id,wallet_address,chain_type' }
      )

    if (error) {
      console.error('[SessionSigners] Error enabling:', summarizeError(error))
      return { success: false, error: error.message }
    }

    // Audit log
    await auditLog(supabase, userId, walletAddress, 'enable', chainType)

    return { success: true }
  } catch (error) {
    console.error('[SessionSigners] Error enabling session signer:', summarizeError(error))
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function revokeSessionSigner(
  userId: string,
  walletAddress: string,
  chainType: ChainType = 'ethereum'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase()

    const { error } = await supabase
      .from('session_signer_permissions')
      .update({
        enabled: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('chain_type', chainType)

    if (error) {
      return { success: false, error: error.message }
    }

    await auditLog(supabase, userId, walletAddress, 'revoke', chainType)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export function getSessionSignerConfig(): SessionSignerConfig {
  const keyQuorumId = process.env.PRIVY_SESSION_SIGNER_KEY_QUORUM_ID
  if (!keyQuorumId) {
    throw new Error('PRIVY_SESSION_SIGNER_KEY_QUORUM_ID not configured')
  }
  return { signerId: keyQuorumId, policyIds: [] }
}

export async function getUserSessionSigners(userId: string): Promise<SessionSignerPermission[]> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('session_signer_permissions')
      .select(SESSION_SIGNER_PERMISSION_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) return []
    return data || []
  } catch {
    return []
  }
}

// ============================================================================
// Privy Wallet ID Resolution
// ============================================================================

/**
 * Resolve the Privy wallet ID for a given address.
 * Looks up the stored privy_wallet_id from the permission record,
 * or falls back to querying Privy's user API.
 */
async function resolvePrivyWalletId(
  userId: string,
  walletAddress: string,
  chainType: ChainType
): Promise<string | null> {
  const supabase = getSupabase()

  // 1. Check DB first
  const { data } = await supabase
    .from('session_signer_permissions')
    .select('privy_wallet_id')
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('chain_type', chainType)
    .single()

  if (data?.privy_wallet_id) {
    return data.privy_wallet_id
  }

  // 2. Fall back to using wallet address directly
  // Privy wallet API accepts wallet IDs; if we don't have one stored,
  // we use the address as a lookup key (the SDK resolves it)
  console.warn(
    '[SessionSigners] No privy_wallet_id stored for',
    walletAddress.substring(0, 10),
    '— using address as fallback'
  )
  return null
}

// ============================================================================
// EVM Transaction Signing — via Privy SDK AuthorizationContext
// ============================================================================

export async function signEVMTransaction(
  userId: string,
  walletAddress: string,
  transaction: EVMTransactionRequest
): Promise<{ success: boolean; signedTransaction?: string; error?: string }> {
  console.log('[SessionSigners] Signing EVM transaction via SDK AuthorizationContext', {
    userId: userId.substring(0, 8) + '...',
    wallet: walletAddress.substring(0, 10) + '...',
    chainId: transaction.chainId,
  })

  try {
    // 1. Verify permission + resolve wallet
    const { walletIdentifier } = await verifyAndResolveWallet(userId, walletAddress, 'ethereum')

    // 2. Sign via Privy SDK (AuthorizationContext handles signing automatically)
    const privy = getPrivyClient()
    const chainId = transaction.chainId ? parseInt(transaction.chainId) : 1
    const txPayload = { ...buildEVMPayload(transaction), chainId }

    // P0-3: Include idempotency key for safe retries
    const idempotencyKey = `evm-sign-${userId.substring(0, 8)}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const result = await (privy as unknown as PrivyWalletApi).walletApi.ethereum.signTransaction({
      walletId: walletIdentifier,
      transaction: txPayload,
      idempotencyKey,
    } as Record<string, unknown>)

    const signedTx = result?.data?.signed_transaction || result?.signed_transaction

    if (!signedTx) {
      console.error('[SessionSigners] Signing response did not include the expected payload')
      return { success: false, error: 'Privy SDK returned no signed transaction' }
    }

    // Audit
    const supabase = getSupabase()
    await auditLog(supabase, userId, walletAddress, 'sign', 'ethereum', {
      chainId: transaction.chainId,
      to: transaction.to,
    })

    return { success: true, signedTransaction: signedTx }
  } catch (error) {
    if (typeof error === 'string') return { success: false, error }
    const message = error instanceof Error ? error.message : 'Failed to sign transaction'
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'signEVMTransaction', userId, walletAddress },
      tags: { layer: 'session-signers', chain: 'ethereum' },
    })
    return { success: false, error: message }
  }
}

// ============================================================================
// Solana Transaction Signing — via Privy SDK AuthorizationContext
// ============================================================================

export async function signSolanaTransaction(
  userId: string,
  walletAddress: string,
  transaction: SolanaTransactionRequest
): Promise<{ success: boolean; signedTransaction?: string; error?: string }> {
  console.log('[SessionSigners] Signing Solana transaction via SDK AuthorizationContext', {
    userId: userId.substring(0, 8) + '...',
    wallet: walletAddress.substring(0, 10) + '...',
  })

  try {
    const { walletIdentifier } = await verifyAndResolveWallet(userId, walletAddress, 'solana')

    const privy = getPrivyClient()
    const versionedTx = deserializeSolanaTx(transaction.serializedTransaction)

    // P0-3: Include idempotency key for safe retries
    const idempotencyKey = `sol-sign-${userId.substring(0, 8)}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const result = await (privy as unknown as PrivyWalletApi).walletApi.solana.signTransaction({
      walletId: walletIdentifier,
      transaction: versionedTx,
      idempotencyKey,
    } as Record<string, unknown>)

    const signedTx = result?.data?.signed_transaction || result?.signed_transaction

    if (!signedTx) {
      return { success: false, error: 'Privy SDK returned no signed transaction' }
    }

    const supabase = getSupabase()
    await auditLog(supabase, userId, walletAddress, 'sign', 'solana')

    return { success: true, signedTransaction: signedTx }
  } catch (error) {
    if (typeof error === 'string') return { success: false, error }
    const message = error instanceof Error ? error.message : 'Failed to sign transaction'
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'signSolanaTransaction', userId, walletAddress },
      tags: { layer: 'session-signers', chain: 'solana' },
    })
    return { success: false, error: message }
  }
}


// ============================================================================
// Execute (Sign + Broadcast via Privy sendTransaction)
// ============================================================================

export async function executeEVMTransaction(
  userId: string,
  walletAddress: string,
  transaction: EVMTransactionRequest
): Promise<BroadcastResult> {
  try {
    // 1. Verify permission + resolve wallet
    const { walletIdentifier } = await verifyAndResolveWallet(userId, walletAddress, 'ethereum')

    // 2. Build transaction payload
    const chainId = transaction.chainId ? parseInt(transaction.chainId) : 1
    const caip2 = `eip155:${chainId}`
    const txPayload = buildEVMPayload(transaction)

    // 3. Send via Privy (sign + nonce + broadcast in one call)
    const privy = getPrivyClient()
    const result = await (privy as unknown as PrivyWalletApi).walletApi.ethereum.sendTransaction({
      walletId: walletIdentifier,
      caip2,
      transaction: txPayload,
    } as Record<string, unknown>)

    const txHash = result?.data?.hash || result?.hash
    if (!txHash) {
      return { success: false, error: 'Privy SDK returned no transaction hash' }
    }

    // Audit
    const supabase = getSupabase()
    await auditLog(supabase, userId, walletAddress, 'broadcast', 'ethereum', {
      txHash,
      chainId: transaction.chainId,
    })

    return { success: true, txHash }
  } catch (error) {
    if (typeof error === 'string') return { success: false, error }
    const message = error instanceof Error ? error.message : 'Failed to execute transaction'
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'executeEVMTransaction', userId, walletAddress },
      tags: { layer: 'session-signers', chain: 'ethereum' },
    })
    return { success: false, error: message }
  }
}

export async function executeSolanaTransaction(
  userId: string,
  walletAddress: string,
  transaction: SolanaTransactionRequest
): Promise<BroadcastResult> {
  try {
    // 1. Verify permission + resolve wallet
    const { walletIdentifier } = await verifyAndResolveWallet(userId, walletAddress, 'solana')

    // 2. Send via Privy (sign + broadcast in one call)
    const caip2 = getSolanaCaip2(transaction.chainId)
    const privy = getPrivyClient()
    const versionedTx = deserializeSolanaTx(transaction.serializedTransaction)

    const result = await (privy as unknown as PrivyWalletApi).walletApi.solana.signAndSendTransaction({
      walletId: walletIdentifier,
      caip2,
      transaction: versionedTx,
    } as Record<string, unknown>)

    const txHash = result?.data?.hash || result?.hash
    if (!txHash) {
      return { success: false, error: 'Privy SDK returned no transaction hash' }
    }

    // Audit
    const supabase = getSupabase()
    await auditLog(supabase, userId, walletAddress, 'broadcast', 'solana', { txHash })

    return { success: true, txHash }
  } catch (error) {
    if (typeof error === 'string') return { success: false, error }
    const message = error instanceof Error ? error.message : 'Failed to execute transaction'
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'executeSolanaTransaction', userId, walletAddress },
      tags: { layer: 'session-signers', chain: 'solana' },
    })
    return { success: false, error: message }
  }
}

export async function executeAutonomousTransaction(
  userId: string,
  walletAddress: string,
  transaction: TransactionRequest
): Promise<BroadcastResult> {
  if (transaction.chainType === 'solana') {
    return executeSolanaTransaction(userId, walletAddress, transaction)
  }
  return executeEVMTransaction(userId, walletAddress, transaction)
}

/**
 * Execute a transaction using a known Privy wallet ID directly.
 *
 * Used by agent wallets (server-owned) — skips the session_signer_permissions
 * lookup since these wallets are fully controlled by the app's authorization key.
 *
 * Uses Privy's sendTransaction / signAndSendTransaction which handles:
 * - Signing with the authorization key
 * - Nonce management (EVM)
 * - Broadcasting to the network
 * - Gas estimation
 * This eliminates the need for manual RPC broadcast endpoints.
 */
export async function executeAgentWalletTransaction(
  privyWalletId: string,
  walletAddress: string,
  transaction: TransactionRequest
): Promise<BroadcastResult> {
  try {
    const privy = getPrivyClient()

    if (transaction.chainType === 'solana') {
      const caip2 = getSolanaCaip2(transaction.chainId)
      const versionedTx = deserializeSolanaTx(transaction.serializedTransaction)

      const result = await (privy as unknown as PrivyWalletApi).walletApi.solana.signAndSendTransaction({
        walletId: privyWalletId,
        caip2,
        transaction: versionedTx,
      } as Record<string, unknown>)

      const txHash = result?.data?.hash || result?.hash
      if (!txHash) {
        return { success: false, error: 'Privy SDK returned no transaction hash' }
      }

      return { success: true, txHash }
    }

    // EVM — Privy SDK v1.32+ expects a single object with walletId inside
    const chainId = transaction.chainId ? parseInt(transaction.chainId) : 1
    const caip2 = `eip155:${chainId}`
    const txPayload = buildEVMPayload(transaction)

    const result = await (privy as unknown as PrivyWalletApi).walletApi.ethereum.sendTransaction({
      walletId: privyWalletId,
      caip2,
      transaction: txPayload,
    } as Record<string, unknown>)

    const txHash = result?.data?.hash || result?.hash
    if (!txHash) {
      return { success: false, error: 'Privy SDK returned no transaction hash' }
    }

    return { success: true, txHash }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent wallet transaction failed'
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'executeAgentWalletTransaction', walletAddress },
      tags: { layer: 'session-signers', chain: transaction.chainType },
    })
    return { success: false, error: message }
  }
}

// ============================================================================
// EIP-712 Typed Data Signing (used by x402 protocol)
// ============================================================================

/**
 * Sign EIP-712 typed data using an agent wallet.
 * Used by x402 protocol for payment authorization headers.
 */
export async function signAgentWalletTypedData(
  privyWalletId: string,
  typedData: Record<string, unknown>
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const privy = getPrivyClient()

    const result = await (privy as unknown as PrivyWalletApi).walletApi.ethereum.signTypedData({
      walletId: privyWalletId,
      typedData,
    } as Record<string, unknown>)

    const signature = result?.data?.signature || result?.signature
    if (!signature) {
      return { success: false, error: 'Privy SDK returned no signature' }
    }

    return { success: true, signature }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sign typed data'
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'signAgentWalletTypedData' },
      tags: { layer: 'session-signers', chain: 'ethereum' },
    })
    return { success: false, error: message }
  }
}

// ============================================================================
// Audit Logging
// ============================================================================

async function auditLog(
  supabase: SupabaseClient,
  userId: string,
  walletAddress: string,
  action: 'enable' | 'revoke' | 'sign' | 'broadcast' | 'fail',
  chainType: ChainType,
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.from('session_signer_audit').insert({
      user_id: userId,
      wallet_address: walletAddress.toLowerCase(),
      action,
      chain_type: chainType,
      metadata: metadata || {},
      ip_address: null,
    })
  } catch {
    // Non-critical — don't fail the operation
  }
}

// ============================================================================
// Chain Helpers
// ============================================================================

export const SUPPORTED_CHAINS = {
  ethereum: [
    { chainId: '1', name: 'Ethereum Mainnet' },
    { chainId: '137', name: 'Polygon' },
    { chainId: '8453', name: 'Base' },
    { chainId: '42161', name: 'Arbitrum One' },
    { chainId: '10', name: 'Optimism' },
    { chainId: '43114', name: 'Avalanche' },
    { chainId: '11155111', name: 'Sepolia' },
    { chainId: '84532', name: 'Base Sepolia' },
  ],
  solana: [
    { chainId: 'mainnet-beta', name: 'Solana Mainnet' },
    { chainId: 'devnet', name: 'Solana Devnet' },
    { chainId: 'testnet', name: 'Solana Testnet' },
  ],
}

export function getChainName(chainType: ChainType, chainId: string): string {
  const chains = SUPPORTED_CHAINS[chainType]
  return chains.find((c) => c.chainId === chainId)?.name || `${chainType}:${chainId}`
}
