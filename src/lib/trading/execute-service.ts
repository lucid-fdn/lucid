import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TransactionRequest } from '@/lib/session-signers'
import { ErrorService } from '@/lib/errors/error-service'

// ---------------------------------------------------------------------------
// validateDestinationAddress
// ---------------------------------------------------------------------------

interface AddressValidationResult {
  allowed: boolean
  reason?: string
}

/**
 * Validates `toAddress` against the transfer_mode policy:
 *  - 'defi_only': must be a known protocol router
 *  - 'owner_only': must be a known router OR the withdrawal address
 *  - 'unrestricted': always allowed
 */
export async function validateDestinationAddress(
  supabase: SupabaseClient,
  toAddress: string,
  chainId: string,
  transferMode: string,
  withdrawalAddress?: string
): Promise<AddressValidationResult> {
  if (transferMode === 'unrestricted') {
    return { allowed: true }
  }

  if (transferMode !== 'defi_only' && transferMode !== 'owner_only') {
    return { allowed: true }
  }

  const { data: routers } = await supabase
    .from('known_protocol_routers')
    .select('router_address')
    .eq('chain_id', chainId)
    .eq('is_active', true)

  const routerAddresses = (routers || []).map((r: { router_address: string }) =>
    r.router_address.toLowerCase()
  )

  const normalised = toAddress.toLowerCase()

  if (transferMode === 'defi_only') {
    if (!routerAddresses.includes(normalised)) {
      return {
        allowed: false,
        reason: 'Destination not in approved protocol routers',
      }
    }
    return { allowed: true }
  }

  // owner_only
  const withdrawalAddr = withdrawalAddress?.toLowerCase()
  if (!routerAddresses.includes(normalised) && normalised !== withdrawalAddr) {
    return {
      allowed: false,
      reason: 'Transfers only to approved routers or withdrawal address',
    }
  }

  return { allowed: true }
}

// ---------------------------------------------------------------------------
// buildTransactionRequest
// ---------------------------------------------------------------------------

/**
 * Builds a typed Solana or EVM `TransactionRequest` from the raw request body.
 */
export function buildTransactionRequest(
  chainType: 'ethereum' | 'solana',
  transactionRequest: {
    chainId?: string
    to?: string
    value?: string
    data?: string
    serializedTransaction?: string
    gasLimit?: string
    maxFeePerGas?: string
    maxPriorityFeePerGas?: string
  }
): TransactionRequest {
  if (chainType === 'solana') {
    return {
      chainType: 'solana' as const,
      chainId: transactionRequest.chainId,
      serializedTransaction: transactionRequest.serializedTransaction || '',
    }
  }

  return {
    chainType: 'ethereum' as const,
    chainId: transactionRequest.chainId,
    to: transactionRequest.to || '',
    value: transactionRequest.value,
    data: transactionRequest.data,
    gasLimit: transactionRequest.gasLimit,
    maxFeePerGas: transactionRequest.maxFeePerGas,
    maxPriorityFeePerGas: transactionRequest.maxPriorityFeePerGas,
  }
}

// ---------------------------------------------------------------------------
// recordAndExecuteTransaction
// ---------------------------------------------------------------------------

interface RecordAndExecuteParams {
  userId: string
  assistantId: string
  orgId: string
  walletAddress: string
  privyWalletId: string
  chainType: 'ethereum' | 'solana'
  chainId?: string | null
  requestData: Record<string, unknown>
  executeFn: () => Promise<{ success: boolean; txHash?: string; error?: string }>
}

interface RecordAndExecuteResult {
  success: boolean
  txHash?: string
  transactionId?: string
  error?: string
}

/**
 * Records a pending transaction row, executes the signing function,
 * then updates the row with the result (submitted / failed).
 */
export async function recordAndExecuteTransaction(
  supabase: SupabaseClient,
  params: RecordAndExecuteParams
): Promise<RecordAndExecuteResult> {
  const {
    userId,
    assistantId,
    orgId,
    walletAddress,
    privyWalletId,
    chainType,
    chainId,
    requestData,
    executeFn,
  } = params

  // Record pending transaction
  const { data: txRecord, error: txInsertError } = await supabase
    .from('trading_transactions')
    .insert({
      user_id: userId,
      assistant_id: assistantId,
      org_id: orgId,
      wallet_address: walletAddress,
      privy_wallet_id: privyWalletId,
      chain_type: chainType,
      chain_id: chainId || null,
      tx_type: 'swap',
      status: 'pending',
      request_data: requestData,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (txInsertError) {
    ErrorService.captureException(txInsertError, {
      severity: 'error',
      context: { operation: 'insertTradingTransaction', userId, assistantId },
      tags: { layer: 'trading-execute' },
    })
  }

  // Execute the transaction
  const result = await executeFn()

  // Update status
  if (txRecord?.id) {
    await supabase
      .from('trading_transactions')
      .update({
        status: result.success ? 'submitted' : 'failed',
        tx_hash: result.txHash || null,
        error_message: result.error || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', txRecord.id)
  }

  return {
    success: result.success,
    txHash: result.txHash,
    transactionId: txRecord?.id,
    error: result.error,
  }
}
