/**
 * DEX Aggregator Service — Unified interface for DEX operations across chains.
 *
 * Providers:
 *   Solana  → Jupiter (https://api.jup.ag/swap/v1, requires JUPITER_API_KEY)
 *   EVM     → 1inch   (requires ONEINCH_API_KEY, https://api.1inch.dev/swap/v6.0)
 *
 * Consumed by:
 *   tools/dex.ts          → dex_get_quote (read-only) + dex_swap (elevated)
 *   platform-tools/       → re-exports dex_swap
 *
 * Future: This service layer will be wrapped by the `lucid-trade` embedded
 * MCP skill, replacing the hardcoded tools/dex.ts integration.
 */

import type { SwapQuote, SwapResult, SupportedChain } from './types.js'
import { getSolanaSwapQuote, buildJupiterSwap, getJupiterQuote } from './jupiter.js'
import { getEVMSwapQuote, build1inchSwap } from './oneinch.js'
import { resolveTokenAddress, getChainId } from './types.js'
import { redactObject } from '../../utils/pii-redactor.js'

export * from './types.js'
export * from './jupiter.js'
export * from './oneinch.js'

// ============================================================================
// Unified DEX Service
// ============================================================================

export class DexAggregatorService {
  /**
   * Get a swap quote for any supported chain
   */
  async getQuote(params: {
    chain: SupportedChain
    inputToken: string
    outputToken: string
    amount: string
    slippageBps?: number
  }): Promise<SwapQuote> {
    const { chain, inputToken, outputToken, amount, slippageBps = 100 } = params

    console.log('[DexAggregator] Getting quote:', redactObject({
      chain,
      inputToken,
      outputToken,
      amount,
      slippageBps,
    }))

    if (chain === 'solana') {
      return getSolanaSwapQuote({
        inputToken,
        outputToken,
        amount,
        slippageBps,
      })
    }

    // EVM chains
    return getEVMSwapQuote(chain, {
      inputToken,
      outputToken,
      amount,
      slippageBps,
    })
  }

  /**
   * Build a swap transaction for execution
   * Returns the serialized transaction ready for signing
   */
  async buildSwapTransaction(params: {
    chain: SupportedChain
    quote: SwapQuote
    walletAddress: string
  }): Promise<{
    serializedTransaction: string
    chainType: 'ethereum' | 'solana'
    chainId: string
    // EVM-specific fields
    to?: string
    value?: string
    data?: string
    gasLimit?: string
  }> {
    const { chain, quote, walletAddress } = params

    console.log('[DexAggregator] Building swap transaction:', redactObject({
      chain,
      dex: quote.dexUsed,
      walletAddress,
    }))

    if (chain === 'solana') {
      // Build Jupiter swap
      const swapResponse = await buildJupiterSwap(
        quote.rawQuote as Parameters<typeof buildJupiterSwap>[0],
        walletAddress
      )

      return {
        serializedTransaction: swapResponse.swapTransaction,
        chainType: 'solana',
        chainId: 'mainnet-beta',
      }
    }

    // EVM chains - build 1inch swap
    const chainId = getChainId(chain)
    const slippagePercent = quote.slippageBps / 100 // Convert bps to percentage

    const swapResponse = await build1inchSwap(chainId, {
      src: quote.inputTokenAddress,
      dst: quote.outputTokenAddress,
      amount: quote.inputAmountRaw,
      from: walletAddress,
      slippage: slippagePercent,
    })

    return {
      serializedTransaction: '', // Not used for EVM
      chainType: 'ethereum',
      chainId,
      to: swapResponse.tx.to,
      value: swapResponse.tx.value,
      data: swapResponse.tx.data,
      gasLimit: swapResponse.tx.gas.toString(),
    }
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): SupportedChain[] {
    return ['solana', 'ethereum', 'base', 'polygon', 'arbitrum']
  }

  /**
   * Check if a chain is supported
   */
  isChainSupported(chain: string): chain is SupportedChain {
    return this.getSupportedChains().includes(chain as SupportedChain)
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let dexServiceInstance: DexAggregatorService | null = null

export function getDexService(): DexAggregatorService {
  if (!dexServiceInstance) {
    dexServiceInstance = new DexAggregatorService()
  }
  return dexServiceInstance
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a swap quote for display
 */
export function formatQuoteForDisplay(quote: SwapQuote): string {
  const lines = [
    `Swap Quote (${quote.dexUsed} on ${quote.chain})`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Input:  ${quote.inputAmount} ${quote.inputToken}`,
    `Output: ${quote.outputAmount} ${quote.outputToken}`,
    `Price:  1 ${quote.inputToken} = ${quote.price} ${quote.outputToken}`,
    `Value:  $${quote.valueUsd.toFixed(2)} USD`,
    ``,
    `Min Output: ${quote.minOutputAmount} ${quote.outputToken}`,
    `Slippage:   ${quote.slippageBps / 100}%`,
  ]

  if (parseFloat(quote.priceImpact) > 0) {
    lines.push(`Price Impact: ${quote.priceImpact}%`)
  }

  if (quote.route.length > 0) {
    lines.push(``)
    lines.push(`Route:`)
    for (const step of quote.route) {
      lines.push(`  • ${step.protocol} (${step.percent}%)`)
    }
  }

  return lines.join('\n')
}

/**
 * Validate swap parameters
 */
export function validateSwapParams(params: {
  chain: string
  inputToken: string
  outputToken: string
  amount: string
}): { valid: boolean; error?: string } {
  const { chain, inputToken, outputToken, amount } = params

  // Check chain
  if (!getDexService().isChainSupported(chain)) {
    return {
      valid: false,
      error: `Unsupported chain: ${chain}. Supported: ${getDexService().getSupportedChains().join(', ')}`,
    }
  }

  // Check tokens
  if (!inputToken || inputToken.length === 0) {
    return { valid: false, error: 'Input token is required' }
  }
  if (!outputToken || outputToken.length === 0) {
    return { valid: false, error: 'Output token is required' }
  }
  if (inputToken.toLowerCase() === outputToken.toLowerCase()) {
    return { valid: false, error: 'Input and output tokens must be different' }
  }

  // Check amount
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return { valid: false, error: 'Amount must be a positive number' }
  }

  return { valid: true }
}
