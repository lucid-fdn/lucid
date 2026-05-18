/**
 * On-Chain Token Decimal Resolution — P1-20
 *
 * Queries on-chain decimals() for ERC20/SPL tokens with permanent caching.
 * Decimals never change, so cache indefinitely.
 */

import { evmRpcCall, solanaRpcCall } from './rpc-fallback.js'
import { redact } from '../../utils/pii-redactor.js'

// Permanent cache — decimals never change for a deployed contract
const decimalCache = new Map<string, number>()

// Well-known decimals (avoid RPC calls for common tokens)
const KNOWN_DECIMALS: Record<string, number> = {
  // Native tokens
  'evm:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 18,
  // USDC variants
  'evm:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,
  'evm:8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,
  'evm:137:0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 6,
  'evm:42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6,
  // USDT
  'evm:1:0xdac17f958d2ee523a2206206994597c13d831ec7': 6,
  'evm:137:0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 6,
  'evm:42161:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 6,
  // WETH (18 decimals on all chains)
  'evm:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 18,
  'evm:8453:0x4200000000000000000000000000000000000006': 18,
  'evm:42161:0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 18,
  // DAI
  'evm:1:0x6b175474e89094c44da98b954eescdecb5be3830': 18,
  // WBTC
  'evm:1:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 8,
  // Solana
  'sol:So11111111111111111111111111111111111111112': 9, // SOL
  'sol:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6, // USDC
  'sol:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6, // USDT
}

/**
 * Get token decimals for an EVM token. Uses cache, then on-chain query.
 */
export async function getEVMTokenDecimals(
  chainId: string,
  tokenAddress: string
): Promise<number> {
  const addr = tokenAddress.toLowerCase()

  // Native token
  if (addr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return 18

  // Check known
  const knownKey = `evm:${chainId}:${addr}`
  if (KNOWN_DECIMALS[knownKey] !== undefined) return KNOWN_DECIMALS[knownKey]

  // Check cache
  const cacheKey = `evm:${chainId}:${addr}`
  if (decimalCache.has(cacheKey)) return decimalCache.get(cacheKey)!

  // On-chain query: decimals() selector = 0x313ce567
  try {
    const result = await evmRpcCall(chainId, {
      method: 'eth_call',
      params: [{ to: tokenAddress, data: '0x313ce567' }, 'latest'],
    })

    if (typeof result === 'string' && result !== '0x' && result.length > 2) {
      const decimals = parseInt(result as string, 16)
      if (!isNaN(decimals) && decimals >= 0 && decimals <= 36) {
        decimalCache.set(cacheKey, decimals)
        return decimals
      }
    }
  } catch (err) {
    console.warn(`[TokenDecimals] Failed to query decimals for ${redact(tokenAddress)} on chain ${chainId}:`, redact(err instanceof Error ? err.message : String(err)))
  }

  // Fallback: assume 18
  console.warn(`[TokenDecimals] Using default 18 decimals for ${redact(tokenAddress)}`)
  return 18
}

/**
 * Get token decimals for a Solana SPL token.
 */
export async function getSolanaTokenDecimals(
  mintAddress: string,
  chainId: string = 'mainnet-beta'
): Promise<number> {
  // SOL native
  if (mintAddress === 'So11111111111111111111111111111111111111112') return 9

  // Check known
  const knownKey = `sol:${mintAddress}`
  if (KNOWN_DECIMALS[knownKey] !== undefined) return KNOWN_DECIMALS[knownKey]

  // Check cache
  const cacheKey = `sol:${chainId}:${mintAddress}`
  if (decimalCache.has(cacheKey)) return decimalCache.get(cacheKey)!

  // On-chain: getAccountInfo for mint
  try {
    const result = await solanaRpcCall(chainId, {
      method: 'getAccountInfo',
      params: [mintAddress, { encoding: 'jsonParsed' }],
    }) as { value?: { data?: { parsed?: { info?: { decimals?: number } } } } }

    const decimals = result?.value?.data?.parsed?.info?.decimals
    if (typeof decimals === 'number') {
      decimalCache.set(cacheKey, decimals)
      return decimals
    }
  } catch (err) {
    console.warn(`[TokenDecimals] Failed to query Solana decimals for ${redact(mintAddress)}:`, redact(err instanceof Error ? err.message : String(err)))
  }

  // Fallback
  return 9
}

/**
 * Convenience: resolve decimals for any chain type
 */
export async function getTokenDecimals(
  chainType: 'ethereum' | 'solana',
  chainId: string,
  tokenAddress: string
): Promise<number> {
  if (chainType === 'solana') {
    return getSolanaTokenDecimals(tokenAddress, chainId)
  }
  return getEVMTokenDecimals(chainId, tokenAddress)
}
