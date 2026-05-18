/**
 * Transaction Status Poller — P0-13
 *
 * Polls blockchain RPCs for transaction confirmation status.
 * Updates trading_transactions with confirmed_at, block_number, final status.
 * Designed to be called via cron job or QStash schedule.
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { ErrorService } from '@/lib/errors/error-service'

// ============================================================================
// Config
// ============================================================================

const MAX_ATTEMPTS = 20
const BATCH_SIZE = 50

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ============================================================================
// RPC URLs (duplicated from session-signers for independence)
// ============================================================================

function getEvmRpc(chainId: string): string | null {
  const rpcs: Record<string, string | undefined> = {
    '1': process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    '137': process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    '8453': process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    '42161': process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    '10': process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
  }
  return rpcs[chainId] || null
}

function getSolRpc(chainId: string): string | null {
  const rpcs: Record<string, string | undefined> = {
    'mainnet-beta': process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    devnet: process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
  }
  return rpcs[chainId] || null
}

// ============================================================================
// Main Poller
// ============================================================================

export interface PollResult {
  processed: number
  confirmed: number
  failed: number
  abandoned: number
}

/**
 * Poll all pending/submitted transactions for confirmation.
 * Call this from a cron endpoint every 15-30 seconds.
 */
export async function pollPendingTransactions(): Promise<PollResult> {
  const supabase = getSupabase()
  const result: PollResult = { processed: 0, confirmed: 0, failed: 0, abandoned: 0 }

  const { data: txs, error } = await supabase
    .from('trading_transactions')
    .select('id, tx_hash, chain_type, chain_id, status, confirmation_attempts')
    .in('status', ['pending', 'submitted'])
    .lt('confirmation_attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error || !txs?.length) return result

  for (const tx of txs) {
    result.processed++

    // Skip txs without hash (still signing)
    if (!tx.tx_hash) {
      // Abandon if too many attempts with no hash
      if ((tx.confirmation_attempts || 0) >= 5) {
        await supabase
          .from('trading_transactions')
          .update({
            status: 'failed',
            error_message: 'Transaction never received a hash after 5 attempts',
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.id)
        result.abandoned++
      } else {
        await supabase
          .from('trading_transactions')
          .update({
            confirmation_attempts: (tx.confirmation_attempts || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.id)
      }
      continue
    }

    try {
      const confirmation =
        tx.chain_type === 'solana'
          ? await checkSolanaConfirmation(tx.tx_hash, tx.chain_id || 'mainnet-beta')
          : await checkEvmConfirmation(tx.tx_hash, tx.chain_id || '1')

      if (confirmation.confirmed) {
        await supabase
          .from('trading_transactions')
          .update({
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            block_number: confirmation.blockNumber || null,
            confirmation_attempts: (tx.confirmation_attempts || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.id)
        result.confirmed++
      } else if (confirmation.failed) {
        await supabase
          .from('trading_transactions')
          .update({
            status: 'failed',
            error_message: confirmation.error || 'Transaction reverted on-chain',
            confirmation_attempts: (tx.confirmation_attempts || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.id)
        result.failed++
      } else {
        // Still pending — increment attempts
        const attempts = (tx.confirmation_attempts || 0) + 1
        if (attempts >= MAX_ATTEMPTS) {
          await supabase
            .from('trading_transactions')
            .update({
              status: 'failed',
              error_message: `Transaction not confirmed after ${MAX_ATTEMPTS} polling attempts`,
              confirmation_attempts: attempts,
              updated_at: new Date().toISOString(),
            })
            .eq('id', tx.id)
          result.abandoned++
        } else {
          await supabase
            .from('trading_transactions')
            .update({
              confirmation_attempts: attempts,
              updated_at: new Date().toISOString(),
            })
            .eq('id', tx.id)
        }
      }
    } catch (err) {
      ErrorService.captureException(err, {
        severity: 'warning',
        context: { operation: 'pollTransaction', txId: tx.id, txHash: tx.tx_hash },
        tags: { layer: 'tx-poller' },
      })
    }
  }

  return result
}

// ============================================================================
// Chain-Specific Confirmation Checks
// ============================================================================

interface ConfirmationResult {
  confirmed: boolean
  failed: boolean
  blockNumber?: number
  error?: string
}

async function checkEvmConfirmation(
  txHash: string,
  chainId: string
): Promise<ConfirmationResult> {
  const rpcUrl = getEvmRpc(chainId)
  if (!rpcUrl) return { confirmed: false, failed: false }

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json()
    const receipt = data.result

    if (!receipt) return { confirmed: false, failed: false } // Still pending

    const status = parseInt(receipt.status, 16)
    const blockNumber = parseInt(receipt.blockNumber, 16)

    if (status === 1) {
      return { confirmed: true, failed: false, blockNumber }
    } else {
      return { confirmed: false, failed: true, error: 'Transaction reverted (status=0)' }
    }
  } catch {
    return { confirmed: false, failed: false }
  }
}

async function checkSolanaConfirmation(
  txHash: string,
  chainId: string
): Promise<ConfirmationResult> {
  const rpcUrl = getSolRpc(chainId)
  if (!rpcUrl) return { confirmed: false, failed: false }

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[txHash], { searchTransactionHistory: true }],
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json()
    const status = data.result?.value?.[0]

    if (!status) return { confirmed: false, failed: false }

    if (status.err) {
      return { confirmed: false, failed: true, error: JSON.stringify(status.err) }
    }

    if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
      return { confirmed: true, failed: false, blockNumber: status.slot }
    }

    return { confirmed: false, failed: false }
  } catch {
    return { confirmed: false, failed: false }
  }
}