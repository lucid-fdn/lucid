/**
 * Web3 Operator initialization — wires DI config at worker startup.
 *
 * Injects RPC URL resolver, tool result cache, and snapshot store
 * so @lucid-fdn/web3-operator has no direct dependency on LucidMerged internals.
 */

import { initWeb3Operator } from '@lucid-fdn/web3-operator'
import { getEvmRpcUrl, getSolanaRpcUrl } from '../services/chain/rpc-fallback.js'
import { toolCache } from '../lib/cache/tool-cache.js'

const CHAIN_IDS: Record<string, string> = {
  ethereum: '1',
  base: '8453',
  arbitrum: '42161',
  polygon: '137',
  optimism: '10',
}

export function initWeb3(): void {
  initWeb3Operator({
    rpcUrlResolver: (chain) => {
      if (chain === 'solana') return getSolanaRpcUrl('mainnet-beta')
      const chainId = CHAIN_IDS[chain] || '1'
      return getEvmRpcUrl(chainId) || `https://${chain}.llamarpc.com`
    },
    toolCache: {
      get: (tool, key) => toolCache.get(tool, key),
      set: (tool, key, value) => toolCache.set(tool, key, value),
    },
  })
  console.log('   Web3 Operator: ✅ initialized')
}
