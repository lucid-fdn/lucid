/**
 * Jupiter DEX Aggregator Service
 * Handles Solana swaps via Jupiter API
 *
 * API Docs: https://dev.jup.ag/docs/swap-api
 */

import type {
  SwapQuote,
  SwapRoute,
  JupiterQuoteResponse,
  JupiterSwapResponse,
  TokenInfo,
} from './types.js'
import { SOLANA_TOKENS, resolveTokenAddress } from './types.js'
import { redact, redactObject } from '../../utils/pii-redactor.js'

// Well-known Solana token decimals — avoids fetching the entire strict list
// just to learn that USDC has 6 decimals. Unknown tokens still hit the API.
const KNOWN_DECIMALS: Record<string, number> = {
  So11111111111111111111111111111111111111112: 9,   // SOL / WSOL
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6, // USDC
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6,  // USDT
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: 9,   // mSOL
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: 9,  // JitoSOL
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: 9,   // bSOL
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 5,  // BONK
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 6,   // JUP
}

// Jupiter migrated from quote-api.jup.ag/v6 to api.jup.ag/swap/v1 (2025).
// All endpoints now require x-api-key header (free key from portal.jup.ag).
const JUPITER_API_BASE = process.env.JUPITER_API_URL || 'https://api.jup.ag'
const JUPITER_SWAP_PATH = '/swap/v1'
const JUPITER_API_KEY = process.env.JUPITER_API_KEY

function jupiterHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Accept': 'application/json' }
  if (JUPITER_API_KEY) h['x-api-key'] = JUPITER_API_KEY
  return h
}

// ============================================================================
// Quote Functions
// ============================================================================

/**
 * Get a swap quote from Jupiter
 */
export async function getJupiterQuote(params: {
  inputMint: string
  outputMint: string
  amount: string // In lamports (smallest denomination)
  slippageBps: number
}): Promise<JupiterQuoteResponse> {
  const { inputMint, outputMint, amount, slippageBps } = params

  const url = new URL(`${JUPITER_API_BASE}${JUPITER_SWAP_PATH}/quote`)
  url.searchParams.set('inputMint', inputMint)
  url.searchParams.set('outputMint', outputMint)
  url.searchParams.set('amount', amount)
  url.searchParams.set('slippageBps', slippageBps.toString())
  url.searchParams.set('restrictIntermediateTokens', 'true')

  console.log('[Jupiter] Fetching quote:', redactObject({ inputMint, outputMint, amount, slippageBps }))

  const response = await fetch(url.toString(), {
    headers: jupiterHeaders(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Jupiter] Quote error:', response.status, redact(errorText))
    throw new Error(`Jupiter quote failed: ${response.status} - ${errorText}`)
  }

  const quote = await response.json() as JupiterQuoteResponse
  console.log('[Jupiter] Quote received:', {
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    priceImpact: quote.priceImpactPct,
  })

  return quote
}

/**
 * Build a swap transaction from a Jupiter quote
 */
export async function buildJupiterSwap(
  quote: JupiterQuoteResponse,
  userPublicKey: string,
  options?: {
    wrapAndUnwrapSol?: boolean
    computeUnitPriceMicroLamports?: number
    prioritizationFeeLamports?: number
  }
): Promise<JupiterSwapResponse> {
  const url = `${JUPITER_API_BASE}${JUPITER_SWAP_PATH}/swap`

  const requestBody = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol: options?.wrapAndUnwrapSol ?? true,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
    ...(options?.prioritizationFeeLamports && {
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: options.prioritizationFeeLamports,
          priorityLevel: 'high',
        },
      },
    }),
  }

  console.log('[Jupiter] Building swap transaction for:', redact(userPublicKey))

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...jupiterHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Jupiter] Swap build error:', response.status, redact(errorText))
    throw new Error(`Jupiter swap build failed: ${response.status} - ${errorText}`)
  }

  const swapResponse = await response.json() as JupiterSwapResponse
  console.log('[Jupiter] Swap transaction built, lastValidBlockHeight:', swapResponse.lastValidBlockHeight)

  return swapResponse
}

// ============================================================================
// Price Functions
// ============================================================================

/**
 * Get token price in USD from Jupiter
 */
export async function getJupiterPrice(mintAddress: string): Promise<number | null> {
  try {
    const url = `${JUPITER_API_BASE}/price/v3?ids=${mintAddress}`
    const response = await fetch(url, { headers: jupiterHeaders() })

    if (!response.ok) {
      console.warn('[Jupiter] Price fetch failed:', response.status)
      return null
    }

    // v3 returns { [mintAddress]: { usdPrice: number } } (no wrapping "data" key)
    const data = await response.json() as Record<string, { usdPrice?: number }>
    return data[mintAddress]?.usdPrice ?? null
  } catch (error) {
    console.warn('[Jupiter] Price fetch error:', redact(error instanceof Error ? error.message : String(error)))
    return null
  }
}

/**
 * Get multiple token prices
 */
export async function getJupiterPrices(mintAddresses: string[]): Promise<Record<string, number>> {
  try {
    const ids = mintAddresses.join(',')
    const url = `${JUPITER_API_BASE}/price/v3?ids=${ids}`
    const response = await fetch(url, { headers: jupiterHeaders() })

    if (!response.ok) {
      console.warn('[Jupiter] Prices fetch failed:', response.status)
      return {}
    }

    // v3 returns { [mintAddress]: { usdPrice: number } }
    const data = await response.json() as Record<string, { usdPrice?: number }>

    const prices: Record<string, number> = {}
    for (const [mint, info] of Object.entries(data)) {
      if (info?.usdPrice) {
        prices[mint] = info.usdPrice
      }
    }

    return prices
  } catch (error) {
    console.warn('[Jupiter] Prices fetch error:', redact(error instanceof Error ? error.message : String(error)))
    return {}
  }
}

// ============================================================================
// Token Info
// ============================================================================

/**
 * Get token info from Jupiter
 */
export async function getJupiterTokenInfo(mintAddress: string): Promise<TokenInfo | null> {
  try {
    // Jupiter token list API
    const url = `${JUPITER_API_BASE}/tokens/v1/strict`
    const response = await fetch(url, { headers: jupiterHeaders() })

    if (!response.ok) {
      return null
    }

    const tokens = await response.json() as Array<{
      address: string
      symbol: string
      name: string
      decimals: number
      logoURI?: string
    }>

    const token = tokens.find(t => t.address === mintAddress)
    if (!token) {
      return null
    }

    // Get price
    const price = await getJupiterPrice(mintAddress)

    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoUri: token.logoURI,
      priceUsd: price || undefined,
    }
  } catch (error) {
    console.warn('[Jupiter] Token info fetch error:', redact(error instanceof Error ? error.message : String(error)))
    return null
  }
}

// ============================================================================
// High-Level Quote Function
// ============================================================================

/**
 * Get a formatted swap quote for Solana
 */
export async function getSolanaSwapQuote(params: {
  inputToken: string // Symbol or address
  outputToken: string // Symbol or address
  amount: string // Human-readable amount (e.g., "1.5")
  slippageBps: number
}): Promise<SwapQuote> {
  const { inputToken, outputToken, amount, slippageBps } = params

  // Resolve token addresses
  const inputMint = resolveTokenAddress(inputToken, 'solana')
  const outputMint = resolveTokenAddress(outputToken, 'solana')

  // Resolve decimals: use known map first, fall back to API, then default 9
  const inputInfo = KNOWN_DECIMALS[inputMint] !== undefined ? null : await getJupiterTokenInfo(inputMint)
  const outputInfo = KNOWN_DECIMALS[outputMint] !== undefined ? null : await getJupiterTokenInfo(outputMint)

  const inputDecimals = KNOWN_DECIMALS[inputMint] ?? inputInfo?.decimals ?? 9
  const outputDecimals = KNOWN_DECIMALS[outputMint] ?? outputInfo?.decimals ?? 9

  // Convert human amount to lamports
  const amountRaw = Math.floor(parseFloat(amount) * Math.pow(10, inputDecimals)).toString()

  // Get quote
  const quote = await getJupiterQuote({
    inputMint,
    outputMint,
    amount: amountRaw,
    slippageBps,
  })

  // Get prices for USD value
  const prices = await getJupiterPrices([inputMint, outputMint])
  const inputPrice = prices[inputMint] || 0
  const valueUsd = parseFloat(amount) * inputPrice

  // Calculate output amount — use Number(BigInt()) to avoid parseInt overflow on large values
  const outputAmount = (Number(BigInt(quote.outAmount)) / Math.pow(10, outputDecimals)).toString()
  const minOutputAmount = (Number(BigInt(quote.otherAmountThreshold)) / Math.pow(10, outputDecimals)).toString()

  // Build route info
  const route: SwapRoute[] = quote.routePlan.map(step => ({
    protocol: step.swapInfo.label,
    inputToken: step.swapInfo.inputMint,
    outputToken: step.swapInfo.outputMint,
    percent: step.percent,
  }))

  return {
    inputToken: inputInfo?.symbol || inputToken,
    inputTokenAddress: inputMint,
    inputAmount: amount,
    inputAmountRaw: amountRaw,

    outputToken: outputInfo?.symbol || outputToken,
    outputTokenAddress: outputMint,
    outputAmount,
    outputAmountRaw: quote.outAmount,

    price: (parseFloat(outputAmount) / parseFloat(amount)).toString(),
    priceImpact: quote.priceImpactPct,
    valueUsd,

    slippageBps,
    minOutputAmount,
    minOutputAmountRaw: quote.otherAmountThreshold,

    route,
    dexUsed: 'jupiter',
    chain: 'solana',

    rawQuote: quote,
  }
}
