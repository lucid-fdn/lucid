/**
 * 1inch DEX Aggregator Service
 * Handles EVM swaps via 1inch API
 *
 * API Docs: https://docs.1inch.io/docs/aggregation-protocol/api/swagger
 */

import type {
  SwapQuote,
  SwapRoute,
  SupportedChain,
  OneInchQuoteResponse,
  OneInchSwapResponse,
  TokenInfo,
} from './types.js'
import { EVM_TOKENS, resolveTokenAddress, getChainId } from './types.js'
import { redact, redactObject } from '../../utils/pii-redactor.js'

const ONEINCH_API_BASE = 'https://api.1inch.dev/swap/v6.0'

// Well-known EVM token decimals — avoids relying on API fallback
const EVM_KNOWN_DECIMALS: Record<string, number> = {
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 18, // Native ETH
  // USDC (Ethereum, Base, Polygon, Arbitrum)
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 6,
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6,
  // USDT (Ethereum, Polygon, Arbitrum)
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 6,
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 6,
  // WBTC
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 8,
  // DAI
  '0x6b175474e89094c44da98b954eedeac495271d0f': 18,
  // WETH (Ethereum, Base, Arbitrum)
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 18,
  '0x4200000000000000000000000000000000000006': 18,
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 18,
}

// Chain ID mapping for 1inch
const ONEINCH_CHAIN_IDS: Record<string, number> = {
  '1': 1,         // Ethereum
  '8453': 8453,   // Base
  '137': 137,     // Polygon
  '42161': 42161, // Arbitrum
  '10': 10,       // Optimism
  '43114': 43114, // Avalanche
}

function getApiKey(): string {
  const apiKey = process.env.ONEINCH_API_KEY
  if (!apiKey) {
    throw new Error('ONEINCH_API_KEY not configured')
  }
  return apiKey
}

// ============================================================================
// Quote Functions
// ============================================================================

/**
 * Get a swap quote from 1inch
 */
export async function get1inchQuote(
  chainId: string,
  params: {
    src: string // Source token address
    dst: string // Destination token address
    amount: string // Amount in smallest denomination
  }
): Promise<OneInchQuoteResponse> {
  const { src, dst, amount } = params
  const apiKey = getApiKey()

  const numericChainId = ONEINCH_CHAIN_IDS[chainId]
  if (!numericChainId) {
    throw new Error(`Unsupported chain ID for 1inch: ${chainId}`)
  }

  const url = new URL(`${ONEINCH_API_BASE}/${numericChainId}/quote`)
  url.searchParams.set('src', src)
  url.searchParams.set('dst', dst)
  url.searchParams.set('amount', amount)
  url.searchParams.set('includeTokensInfo', 'true')
  url.searchParams.set('includeProtocols', 'true')
  url.searchParams.set('includeGas', 'true')

  console.log('[1inch] Fetching quote:', redactObject({ chainId, src, dst, amount }))

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[1inch] Quote error:', response.status, redact(errorText))
    throw new Error(`1inch quote failed: ${response.status} - ${errorText}`)
  }

  const quote = await response.json() as OneInchQuoteResponse
  console.log('[1inch] Quote received:', {
    dstAmount: quote.dstAmount,
    gas: quote.gas,
  })

  return quote
}

/**
 * Build a swap transaction from 1inch
 */
export async function build1inchSwap(
  chainId: string,
  params: {
    src: string
    dst: string
    amount: string
    from: string // User wallet address
    slippage: number // Percentage (1 = 1%)
  }
): Promise<OneInchSwapResponse> {
  const { src, dst, amount, from, slippage } = params
  const apiKey = getApiKey()

  const numericChainId = ONEINCH_CHAIN_IDS[chainId]
  if (!numericChainId) {
    throw new Error(`Unsupported chain ID for 1inch: ${chainId}`)
  }

  const url = new URL(`${ONEINCH_API_BASE}/${numericChainId}/swap`)
  url.searchParams.set('src', src)
  url.searchParams.set('dst', dst)
  url.searchParams.set('amount', amount)
  url.searchParams.set('from', from)
  url.searchParams.set('slippage', slippage.toString())
  url.searchParams.set('includeTokensInfo', 'true')
  url.searchParams.set('includeProtocols', 'true')
  url.searchParams.set('disableEstimate', 'false')

  console.log('[1inch] Building swap transaction for:', redact(from))

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[1inch] Swap build error:', response.status, redact(errorText))
    throw new Error(`1inch swap build failed: ${response.status} - ${errorText}`)
  }

  const swapResponse = await response.json() as OneInchSwapResponse
  console.log('[1inch] Swap transaction built')

  return swapResponse
}

// ============================================================================
// Token Info
// ============================================================================

/**
 * Get token info from 1inch
 */
export async function get1inchTokenInfo(
  chainId: string,
  tokenAddress: string
): Promise<TokenInfo | null> {
  try {
    const apiKey = getApiKey()
    const numericChainId = ONEINCH_CHAIN_IDS[chainId]
    if (!numericChainId) {
      return null
    }

    const url = `${ONEINCH_API_BASE}/${numericChainId}/tokens`
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json() as {
      tokens: Record<string, {
        address: string
        symbol: string
        name: string
        decimals: number
        logoURI?: string
      }>
    }

    const normalizedAddress = tokenAddress.toLowerCase()
    const token = data.tokens[normalizedAddress]

    if (!token) {
      return null
    }

    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoUri: token.logoURI,
    }
  } catch (error) {
    console.warn('[1inch] Token info fetch error:', redact(error instanceof Error ? error.message : String(error)))
    return null
  }
}

/**
 * Get token prices from 1inch
 */
export async function get1inchPrices(
  chainId: string,
  tokenAddresses: string[]
): Promise<Record<string, number>> {
  try {
    const apiKey = getApiKey()
    const numericChainId = ONEINCH_CHAIN_IDS[chainId]
    if (!numericChainId) {
      return {}
    }

    // Use Spot Price Aggregator
    const url = `https://api.1inch.dev/price/v1.1/${numericChainId}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        tokens: tokenAddresses,
        currency: 'USD',
      }),
    })

    if (!response.ok) {
      return {}
    }

    const data = await response.json() as Record<string, string>

    const prices: Record<string, number> = {}
    for (const [address, price] of Object.entries(data)) {
      prices[address.toLowerCase()] = parseFloat(price)
    }

    return prices
  } catch (error) {
    console.warn('[1inch] Prices fetch error:', redact(error instanceof Error ? error.message : String(error)))
    return {}
  }
}

// ============================================================================
// High-Level Quote Function
// ============================================================================

/**
 * Get a formatted swap quote for EVM chains
 */
export async function getEVMSwapQuote(
  chain: SupportedChain,
  params: {
    inputToken: string // Symbol or address
    outputToken: string // Symbol or address
    amount: string // Human-readable amount (e.g., "1.5")
    slippageBps: number
  }
): Promise<SwapQuote> {
  const { inputToken, outputToken, amount, slippageBps } = params
  const chainId = getChainId(chain)

  // Resolve token addresses
  const srcAddress = resolveTokenAddress(inputToken, chain, chainId)
  const dstAddress = resolveTokenAddress(outputToken, chain, chainId)

  // Get token info for decimals — use well-known map first, then API
  const srcInfo = await get1inchTokenInfo(chainId, srcAddress)
  const dstInfo = await get1inchTokenInfo(chainId, dstAddress)

  const srcDecimals = srcInfo?.decimals ?? EVM_KNOWN_DECIMALS[srcAddress.toLowerCase()] ?? 18
  const dstDecimals = dstInfo?.decimals ?? EVM_KNOWN_DECIMALS[dstAddress.toLowerCase()] ?? 18

  // Convert human amount to smallest denomination
  const amountRaw = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, srcDecimals))).toString()

  // Get quote
  const quote = await get1inchQuote(chainId, {
    src: srcAddress,
    dst: dstAddress,
    amount: amountRaw,
  })

  // Get prices for USD value
  const prices = await get1inchPrices(chainId, [srcAddress, dstAddress])
  const inputPrice = prices[srcAddress.toLowerCase()] || 0
  const valueUsd = parseFloat(amount) * inputPrice

  // Calculate output amount — divide raw amount by 10^decimals
  const outputAmountFormatted = (Number(BigInt(quote.dstAmount)) / Math.pow(10, dstDecimals)).toString()

  // Calculate min output based on slippage
  const slippageMultiplier = 1 - (slippageBps / 10000)
  const minOutputRaw = BigInt(Math.floor(Number(BigInt(quote.dstAmount)) * slippageMultiplier)).toString()
  const minOutputFormatted = (Number(BigInt(minOutputRaw)) / Math.pow(10, dstDecimals)).toString()

  // Build route info from protocols
  const route: SwapRoute[] = []
  if (quote.protocols && quote.protocols.length > 0) {
    for (const routeGroup of quote.protocols) {
      for (const routeStep of routeGroup) {
        for (const step of routeStep) {
          route.push({
            protocol: step.name,
            inputToken: step.fromTokenAddress,
            outputToken: step.toTokenAddress,
            percent: step.part,
          })
        }
      }
    }
  }

  return {
    inputToken: quote.srcToken?.symbol || inputToken,
    inputTokenAddress: srcAddress,
    inputAmount: amount,
    inputAmountRaw: amountRaw,

    outputToken: quote.dstToken?.symbol || outputToken,
    outputTokenAddress: dstAddress,
    outputAmount: outputAmountFormatted,
    outputAmountRaw: quote.dstAmount,

    price: (parseFloat(outputAmountFormatted) / parseFloat(amount)).toString(),
    priceImpact: '0', // 1inch doesn't provide price impact directly
    valueUsd,

    slippageBps,
    minOutputAmount: minOutputFormatted,
    minOutputAmountRaw: minOutputRaw,

    route,
    dexUsed: '1inch',
    chain,

    rawQuote: quote,
  }
}
