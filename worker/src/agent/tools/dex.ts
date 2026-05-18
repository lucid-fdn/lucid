/**
 * DEX Tools
 * Swap quote and execution tools
 */

import type { TransactionSigner } from '@lucid-fdn/agent-tools-core'
import type { SupportedChain, SwapQuote } from '../../services/dex/types.js'
import { getDexService, formatQuoteForDisplay, validateSwapParams } from '../../services/dex/index.js'
import { createTradingPolicyGuard } from '../../guards/TradingPolicyGuard.js'
import { redact, redactObject } from '../../utils/pii-redactor.js'
import type { ToolContext } from './types.js'
import { translateTxError, sanitizeToolError } from './tx-error-translator.js'

// ============================================================================
// Types
// ============================================================================

interface DexQuoteArgs {
  chain: SupportedChain
  inputToken: string
  outputToken: string
  amount: string
  slippageBps?: number
}

interface DexSwapArgs {
  chain: SupportedChain
  walletAddress?: string
  inputToken: string
  outputToken: string
  amount: string
  slippageBps?: number
}

// ============================================================================
// DEX Get Quote Tool (Read-only, Safe)
// ============================================================================

/** Minimal interface for dex service dependency injection. */
export interface DexServiceLike {
  getQuote(params: {
    chain: SupportedChain
    inputToken: string
    outputToken: string
    amount: string
    slippageBps?: number
  }): Promise<SwapQuote>
}

/** Dependencies that can be injected into toolDexGetQuote. */
export interface DexGetQuoteDeps {
  dexService?: DexServiceLike
  validateSwap?: typeof validateSwapParams
  formatQuote?: typeof formatQuoteForDisplay
}

/**
 * Get a swap quote from DEX aggregators.
 *
 * @param args - quote query args
 * @param deps - optional injected dependencies. Falls back to module-level singletons.
 */
export async function toolDexGetQuote(args: DexQuoteArgs, deps?: DexGetQuoteDeps): Promise<string> {
  const { chain, inputToken, outputToken, amount, slippageBps = 150 } = args

  // Validate parameters
  const validate = deps?.validateSwap ?? validateSwapParams
  const validation = validate({ chain, inputToken, outputToken, amount })
  if (!validation.valid) {
    return `Error: ${validation.error}`
  }

  console.log('[DexTool] Getting quote:', redactObject({
    chain,
    inputToken,
    outputToken,
    amount,
    slippageBps,
  }))

  try {
    const dexService = deps?.dexService ?? getDexService()
    const quote = await dexService.getQuote({
      chain,
      inputToken,
      outputToken,
      amount,
      slippageBps,
    })

    const format = deps?.formatQuote ?? formatQuoteForDisplay
    return format(quote)
  } catch (error) {
    console.error('[DexTool] Quote error:', redact(sanitizeToolError(error)))
    return `Error getting quote: ${sanitizeToolError(error)}`
  }
}

// ============================================================================
// DEX Swap Tool (Elevated, Requires Policy)
// ============================================================================

/**
 * Execute a token swap via DEX
 * Requires an authorized wallet and trading policy
 */
export async function toolDexSwap(args: DexSwapArgs, context: ToolContext, signer: TransactionSigner): Promise<string> {
  const { chain, inputToken, outputToken, amount, slippageBps = 150 } = args
  const { supabase, userId, assistantId, runId, toolCallId } = context

  // Validate parameters
  const validation = validateSwapParams({ chain, inputToken, outputToken, amount })
  if (!validation.valid) {
    return `Error: ${validation.error}`
  }

  // Resolve wallet: agent wallet (DB-managed) takes priority, then args (legacy session-signer mode)
  const chainKey = chain === 'solana' ? 'solana' : 'evm'
  const agentWallet = context.agentWallets?.[chainKey]
  const walletAddress = agentWallet?.address || args.walletAddress
  if (!walletAddress) {
    return 'Error: No wallet available. Enable agent wallet or provide walletAddress.'
  }

  console.log('[DexTool] Executing swap:', redactObject({
    chain,
    walletAddress,
    inputToken,
    outputToken,
    amount,
  }))

  try {
    // 1. Get quote first
    const dexService = getDexService()
    const quote = await dexService.getQuote({
      chain,
      inputToken,
      outputToken,
      amount,
      slippageBps,
    })

    // 2. Check trading policy
    const policyGuard = createTradingPolicyGuard(supabase, assistantId, userId)
    const policyCheck = await policyGuard.canExecuteTrade({
      chain,
      inputToken: quote.inputToken,
      outputToken: quote.outputToken,
      valueUsd: quote.valueUsd,
      type: 'swap',
    })

    if (!policyCheck.allowed) {
      return `Swap blocked by trading policy: ${policyCheck.reason}`
    }

    // Check if confirmation required
    if (policyCheck.requiresConfirmation) {
      return `Swap requires user confirmation.
${formatQuoteForDisplay(quote)}

Trade value ($${quote.valueUsd.toFixed(2)}) exceeds confirmation threshold.
Please confirm you want to proceed with this swap.`
    }

    // Adaptive slippage: bump for micro-swaps (< $10) to avoid dust failures
    const baseSlippage = policyCheck.maxSlippageBps || slippageBps
    const effectiveSlippage = quote.valueUsd < 10 ? Math.max(baseSlippage, 250) : baseSlippage

    // 3. Build swap transaction
    const swapTx = await dexService.buildSwapTransaction({
      chain,
      quote: { ...quote, slippageBps: effectiveSlippage },
      walletAddress,
    })

    // 4. Record pending transaction
    const recordResult = await policyGuard.recordTrade({
      txHash: '', // Will be updated after broadcast
      txType: 'swap',
      chainType: swapTx.chainType,
      chainId: swapTx.chainId,
      inputToken: quote.inputToken,
      inputAmount: quote.inputAmount,
      outputToken: quote.outputToken,
      outputAmount: quote.outputAmount,
      valueUsd: quote.valueUsd,
      slippageBps: effectiveSlippage,
      status: 'pending',
      dexUsed: quote.dexUsed,
      toolCallId,
      runId,
    })

    if (!recordResult.success) {
      return `Failed to record transaction: ${recordResult.error}`
    }

    const txId = recordResult.transactionId

    // 5. Sign and broadcast transaction using session signer
    console.log('[DexTool] Signing and broadcasting transaction...')

    let executionResult

    if (swapTx.chainType === 'solana') {
      // Solana transaction
      if (!swapTx.serializedTransaction) {
        await policyGuard.updateTransactionStatus(txId!, 'failed', {
          errorMessage: 'Solana transaction data not available',
        })
        return `Error: Solana transaction could not be built. Missing serialized transaction data.`
      }

      executionResult = await signer.executeTransaction({
        chain: 'solana',
        serializedTransaction: swapTx.serializedTransaction,
      })
    } else {
      // EVM transaction
      if (!swapTx.to) {
        await policyGuard.updateTransactionStatus(txId!, 'failed', {
          errorMessage: 'EVM transaction data not available',
        })
        return `Error: EVM transaction could not be built. Missing recipient address.`
      }

      executionResult = await signer.executeTransaction({
        chain: 'evm',
        chainId: swapTx.chainId || '1',
        to: swapTx.to,
        value: swapTx.value,
        data: swapTx.data,
        gasLimit: swapTx.gasLimit,
      })
    }

    // 6. Update transaction status based on result
    if (executionResult.success && executionResult.txHash) {
      await policyGuard.updateTransactionStatus(txId!, 'submitted', {
        txHash: executionResult.txHash,
      })

      console.log('[DexTool] Swap executed successfully:', redact(executionResult.txHash))

      return `Swap executed successfully!

${formatQuoteForDisplay(quote)}

Transaction Hash: ${executionResult.txHash}
Status: Submitted
Transaction ID: ${txId}

The transaction has been broadcast to the ${chain} network.
You can track its status on the block explorer.

Daily usage: $${((policyCheck.dailyUsed || 0) + quote.valueUsd).toFixed(2)} / $${(policyCheck.dailyLimit || 0).toFixed(2)}
Remaining: $${Math.max(0, (policyCheck.dailyRemaining || 0) - quote.valueUsd).toFixed(2)}`
    } else {
      // Transaction failed — translate to human-readable
      const rawError = executionResult.error || 'Unknown execution error'
      const { summary, suggestion } = translateTxError(rawError)

      await policyGuard.updateTransactionStatus(txId!, 'failed', {
        errorMessage: rawError,
      })

      console.error('[DexTool] Swap execution failed:', redact(rawError))

      return `Swap failed: ${summary}

${formatQuoteForDisplay(quote)}

What happened: ${summary}
What to do: ${suggestion}
Transaction ID: ${txId}`
    }

  } catch (error) {
    const rawError = error instanceof Error ? error.message : 'Unknown error'
    const { summary, suggestion } = translateTxError(rawError)

    console.error('[DexTool] Swap error:', redact(rawError))

    return `Swap failed: ${summary}

What happened: ${summary}
What to do: ${suggestion}`
  }
}

// ============================================================================
// Helper: Quote Cache
// ============================================================================

// Simple in-memory quote cache (5 second TTL)
const quoteCache = new Map<string, { quote: SwapQuote; timestamp: number }>()
const QUOTE_CACHE_TTL = 5000 // 5 seconds

/**
 * Get a cached quote or fetch a new one
 */
export async function getCachedQuote(params: DexQuoteArgs): Promise<SwapQuote> {
  const cacheKey = `${params.chain}:${params.inputToken}:${params.outputToken}:${params.amount}:${params.slippageBps || 150}`

  const cached = quoteCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < QUOTE_CACHE_TTL) {
    return cached.quote
  }

  const dexService = getDexService()
  const quote = await dexService.getQuote({
    chain: params.chain,
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    amount: params.amount,
    slippageBps: params.slippageBps || 150,
  })

  quoteCache.set(cacheKey, { quote, timestamp: Date.now() })

  // Clean old cache entries
  for (const [key, value] of quoteCache.entries()) {
    if (Date.now() - value.timestamp > QUOTE_CACHE_TTL * 2) {
      quoteCache.delete(key)
    }
  }

  return quote
}
