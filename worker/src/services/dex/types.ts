/**
 * DEX Service Types
 * Shared types for DEX aggregator integrations
 */

export type SupportedChain = 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum'

export interface SwapQuote {
  // Input
  inputToken: string
  inputTokenAddress: string
  inputAmount: string
  inputAmountRaw: string // In smallest denomination

  // Output
  outputToken: string
  outputTokenAddress: string
  outputAmount: string
  outputAmountRaw: string // In smallest denomination

  // Price info
  price: string // Output per input
  priceImpact: string // Percentage
  valueUsd: number

  // Execution info
  slippageBps: number
  minOutputAmount: string
  minOutputAmountRaw: string

  // Route info
  route: SwapRoute[]
  dexUsed: string // 'jupiter' or '1inch'
  chain: SupportedChain

  // Raw data for execution
  rawQuote: unknown
}

export interface SwapRoute {
  protocol: string
  inputToken: string
  outputToken: string
  percent: number
}

export interface SwapResult {
  success: boolean
  txHash?: string
  inputToken: string
  inputAmount: string
  outputToken: string
  outputAmount?: string
  valueUsd: number
  error?: string
  blockNumber?: number
}

// ============================================================================
// Jupiter Types (Solana)
// ============================================================================

export interface JupiterQuoteRequest {
  inputMint: string
  outputMint: string
  amount: string // In lamports/smallest denomination
  slippageBps: number
  onlyDirectRoutes?: boolean
  asLegacyTransaction?: boolean
}

export interface JupiterQuoteResponse {
  inputMint: string
  inAmount: string
  outputMint: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  priceImpactPct: string
  routePlan: JupiterRoutePlan[]
  contextSlot: number
  timeTaken: number
}

export interface JupiterRoutePlan {
  swapInfo: {
    ammKey: string
    label: string
    inputMint: string
    outputMint: string
    inAmount: string
    outAmount: string
    feeAmount: string
    feeMint: string
  }
  percent: number
}

export interface JupiterSwapRequest {
  quoteResponse: JupiterQuoteResponse
  userPublicKey: string
  wrapAndUnwrapSol?: boolean
  useSharedAccounts?: boolean
  feeAccount?: string
  computeUnitPriceMicroLamports?: number
  prioritizationFeeLamports?: number
  asLegacyTransaction?: boolean
  useTokenLedger?: boolean
  destinationTokenAccount?: string
  dynamicComputeUnitLimit?: boolean
}

export interface JupiterSwapResponse {
  swapTransaction: string // Base64 encoded VersionedTransaction
  lastValidBlockHeight: number
  prioritizationFeeLamports?: number
}

// ============================================================================
// 1inch Types (EVM)
// ============================================================================

export interface OneInchQuoteRequest {
  src: string // Source token address
  dst: string // Destination token address
  amount: string // Amount in smallest denomination
  fee?: string // Integrator fee (basis points)
  protocols?: string // Comma-separated list
  includeTokensInfo?: boolean
  includeProtocols?: boolean
  includeGas?: boolean
}

export interface OneInchQuoteResponse {
  dstAmount: string
  srcToken: {
    address: string
    symbol: string
    name: string
    decimals: number
    logoURI: string
  }
  dstToken: {
    address: string
    symbol: string
    name: string
    decimals: number
    logoURI: string
  }
  protocols: Array<Array<Array<{
    name: string
    part: number
    fromTokenAddress: string
    toTokenAddress: string
  }>>>
  gas: number
}

export interface OneInchSwapRequest {
  src: string
  dst: string
  amount: string
  from: string // User wallet address
  slippage: number // Percentage (1 = 1%)
  protocols?: string
  disableEstimate?: boolean
  includeTokensInfo?: boolean
  includeProtocols?: boolean
  includeGas?: boolean
}

export interface OneInchSwapResponse {
  dstAmount: string
  tx: {
    from: string
    to: string
    data: string
    value: string
    gas: number
    gasPrice: string
  }
  srcToken: {
    address: string
    symbol: string
    decimals: number
  }
  dstToken: {
    address: string
    symbol: string
    decimals: number
  }
}

// ============================================================================
// Token Info
// ============================================================================

export interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  logoUri?: string
  priceUsd?: number
}

// ============================================================================
// Token Maps — derived from canonical source (web3-operator/shared/token-constants)
// ============================================================================

import {
  SOLANA_TOKEN_MAP,
  EVM_TOKEN_MAP,
  EVM_CHAIN_IDS,
  resolveTokenAddress as _resolveTokenAddress,
} from '@lucid-fdn/web3-operator'

/** Solana well-known tokens (re-exported from canonical source). */
export const SOLANA_TOKENS: Record<string, string> = {
  ...SOLANA_TOKEN_MAP,
  // Additional tokens not in the web3-operator map
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  WSOL: 'So11111111111111111111111111111111111111112',
}

/** Chain name → chain ID string mapping. */
const CHAIN_ID_STRINGS: Record<SupportedChain, string> = {
  solana: 'mainnet-beta',
  ethereum: '1',
  base: '8453',
  polygon: '137',
  arbitrum: '42161',
}

/** EVM tokens keyed by chain ID (for backward compat with wallet.ts). Derived from canonical chain-name-keyed map. */
export const EVM_TOKENS: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(EVM_TOKEN_MAP).map(([chainName, tokens]) => [
    String(EVM_CHAIN_IDS[chainName]),
    tokens,
  ]),
)

export function resolveTokenAddress(token: string, chain: SupportedChain, chainId?: string): string {
  // If it's already an address, return it
  if (token.length > 20) {
    return token
  }

  const symbol = token.toUpperCase()

  if (chain === 'solana') {
    return SOLANA_TOKENS[symbol] || token
  }

  // EVM chains — try canonical map first, then chain-ID-keyed map
  const result = _resolveTokenAddress(symbol, chain)
  if (result !== symbol) return result

  // Fallback to chain-ID-keyed map (for tokens only in EVM_TOKENS)
  const evmChainId = chainId || getChainId(chain)
  const chainTokens = EVM_TOKENS[evmChainId]
  return chainTokens?.[symbol] || token
}

export function getChainId(chain: SupportedChain): string {
  return CHAIN_ID_STRINGS[chain]
}
