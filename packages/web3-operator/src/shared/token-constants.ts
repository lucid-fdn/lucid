/**
 * Shared token constants — single source of truth for all web3-operator tools.
 *
 * Solana + EVM token maps, chain IDs, decimals.
 * Import from here instead of duplicating in each tool file.
 */

import type { Chain } from '@lucid-fdn/web3-types'

// ── Solana ──────────────────────────────────────────────────────────

export const SOLANA_TOKEN_MAP: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
}

// ── EVM ─────────────────────────────────────────────────────────────

export const EVM_TOKEN_MAP: Record<string, Record<string, string>> = {
  ethereum: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  base: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  },
  polygon: {
    POL: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  arbitrum: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
}

// ── Chain IDs ───────────────────────────────────────────────────────

export const EVM_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  polygon: 137,
  arbitrum: 42161,
}

// ── USDC per chain (for price derivation) ───────────────────────────

export const EVM_USDC: Record<string, string> = {
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
}

// ── Token Decimals (non-18) ─────────────────────────────────────────

export const TOKEN_DECIMALS: Record<string, number> = {
  // USDC
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 6,
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 6,
  '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359': 6,
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831': 6,
  // USDT
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': 6,
  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F': 6,
  // USDbC
  '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA': 6,
  // WBTC
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': 8,
}

// ── DeBridge (native gas token address) ─────────────────────────────

export const DEBRIDGE_CHAIN_IDS: Record<string, number> = {
  ...EVM_CHAIN_IDS,
  solana: 7565164,
}

export const DEBRIDGE_NATIVE_TOKENS: Record<string, Record<string, { symbol: string; decimals: number }>> = {
  ethereum: {
    '0x0000000000000000000000000000000000000000': { symbol: 'ETH', decimals: 18 },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  },
  base: {
    '0x0000000000000000000000000000000000000000': { symbol: 'ETH', decimals: 18 },
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  },
  polygon: {
    '0x0000000000000000000000000000000000000000': { symbol: 'POL', decimals: 18 },
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6 },
  },
  arbitrum: {
    '0x0000000000000000000000000000000000000000': { symbol: 'ETH', decimals: 18 },
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', decimals: 6 },
  },
  solana: {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6 },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6 },
    'So11111111111111111111111111111111111111112': { symbol: 'SOL', decimals: 9 },
  },
}

export const DEBRIDGE_SYMBOL_TO_ADDRESS: Record<string, Record<string, string>> = {
  ethereum: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  },
  base: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  },
  polygon: {
    POL: '0x0000000000000000000000000000000000000000',
    USDC: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  },
  arbitrum: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  },
  solana: {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    SOL: 'So11111111111111111111111111111111111111112',
  },
}

// ── Resolution helpers ──────────────────────────────────────────────

/**
 * Resolve a symbol (e.g. "SOL", "ETH") to its on-chain address.
 * Returns the input unchanged if already an address.
 */
export function resolveTokenAddress(symbolOrAddress: string, chain: string): string {
  const upper = symbolOrAddress.toUpperCase()
  if (chain === 'solana') {
    return SOLANA_TOKEN_MAP[upper] || symbolOrAddress
  }
  return EVM_TOKEN_MAP[chain]?.[upper] || symbolOrAddress
}

/**
 * Get token decimals for a known address. Defaults to 18 for EVM, 9 for Solana.
 */
export function getTokenDecimals(address: string, chain?: string): number {
  return TOKEN_DECIMALS[address] ?? (chain === 'solana' ? 9 : 18)
}

/**
 * Detect chain from address format.
 */
export function detectChain(tokenOrAddress: string): Chain {
  if (tokenOrAddress.length >= 32 && !tokenOrAddress.startsWith('0x')) return 'solana'
  if (tokenOrAddress.startsWith('0x')) return 'ethereum'
  if (SOLANA_TOKEN_MAP[tokenOrAddress.toUpperCase()]) return 'solana'
  return 'solana' // default — most degen activity
}
