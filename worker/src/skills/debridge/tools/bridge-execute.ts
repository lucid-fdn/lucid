/**
 * bridge (execution wrapper) — Cross-chain bridge via DeBridge with tx submission.
 *
 * Wraps toolBridge() from @lucid-fdn/web3-operator which returns a quote + tx data
 * but does NOT execute. This wrapper parses the result and submits the tx via Privy signer.
 *
 * Supports both EVM and Solana source chains.
 */

import type { TransactionSigner } from '@lucid-fdn/agent-tools-core'
import { toolBridge } from '@lucid-fdn/web3-operator'
import type { ToolContext } from '../../../agent/tools/types.js'
import { sanitizeToolError } from '../../../agent/tools/tx-error-translator.js'

// DeBridge tx shape for EVM
interface EvmTxData {
  to: string
  data: string
  value: string
}

// Chain ID mapping for EVM chains
const CHAIN_TO_ID: Record<string, number> = {
  ethereum: 1,
  arbitrum: 42161,
  polygon: 137,
  base: 8453,
  avalanche: 43114,
  bsc: 56,
  optimism: 10,
}

/**
 * Execute a cross-chain bridge via DeBridge.
 * Calls toolBridge() for quote + tx data, then submits the tx via signer.
 */
export async function toolBridgeExecute(
  args: Parameters<typeof toolBridge>[0],
  context: ToolContext,
  signer: TransactionSigner,
): Promise<string> {
  // Step 1: Get bridge quote + tx data
  const quoteResult = await toolBridge(args)

  let parsed: { plan?: unknown; tx?: EvmTxData | null; formatted?: string; error?: string; debridgeOrderId?: string }
  try {
    parsed = JSON.parse(quoteResult)
  } catch {
    return quoteResult // Pass through if not JSON (shouldn't happen)
  }

  // If the quote failed, return the error as-is
  if (parsed.error) {
    return quoteResult
  }

  // If no tx data, return the quote (shouldn't happen for valid quotes)
  if (!parsed.tx) {
    return quoteResult
  }

  const tx = parsed.tx as EvmTxData & Record<string, unknown>
  const isSolana = args.fromChain === 'solana'

  console.log('[BridgeTool] Executing bridge tx:', {
    fromChain: args.fromChain,
    toChain: args.toChain,
    amount: args.amount,
    orderId: parsed.debridgeOrderId,
  })

  try {
    let txResult: { success: boolean; txHash?: string; error?: string }

    if (isSolana) {
      // Solana: tx.data is the serialized transaction (base64)
      const serializedTx = tx.data as string
      if (!serializedTx) {
        return JSON.stringify({ error: 'Bridge returned empty Solana transaction data' })
      }

      txResult = await signer.executeTransaction({
        chain: 'solana',
        serializedTransaction: serializedTx,
      })
    } else {
      // EVM: tx has { to, data, value }
      const evmTx = tx as EvmTxData & Record<string, unknown>
      if (!evmTx.to || !evmTx.data) {
        return JSON.stringify({ error: 'Bridge returned empty EVM transaction data' })
      }

      const chainId = CHAIN_TO_ID[args.fromChain]
      if (!chainId) {
        return JSON.stringify({ error: `Unknown EVM chain: ${args.fromChain}` })
      }

      txResult = await signer.executeTransaction({
        chain: 'evm',
        chainId: String(chainId),
        to: evmTx.to,
        data: evmTx.data,
        value: evmTx.value || '0x0',
        gasLimit: '0x7A120', // 500K gas — bridge txs are complex
      })
    }

    if (!txResult.success) {
      return JSON.stringify({
        error: `Bridge transaction failed: ${txResult.error || 'Execution failed'}`,
        quote: parsed.formatted,
        debridgeOrderId: parsed.debridgeOrderId,
      })
    }

    console.log('[BridgeTool] Bridge tx submitted:', txResult.txHash)

    // Return success with quote details + tx hash
    return JSON.stringify({
      success: true,
      txHash: txResult.txHash,
      debridgeOrderId: parsed.debridgeOrderId,
      formatted: [
        parsed.formatted,
        '',
        `Transaction submitted: ${txResult.txHash}`,
        'The bridge transfer is now in progress. Funds will arrive on the destination chain shortly.',
      ].join('\n'),
    })
  } catch (error) {
    console.error('[BridgeTool] Execution error:', error)
    return JSON.stringify({
      error: `Bridge execution failed: ${sanitizeToolError(error)}`,
      quote: parsed.formatted,
      debridgeOrderId: parsed.debridgeOrderId,
    })
  }
}
