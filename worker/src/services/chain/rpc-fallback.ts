/**
 * RPC Provider Fallback — P1-21
 *
 * Multi-provider RPC with automatic failover.
 * Each chain has a prioritized list of RPC endpoints.
 */

// ============================================================================
// RPC Provider Config
// ============================================================================

const EVM_RPC_PROVIDERS: Record<string, string[]> = {
  '1': [
    process.env.ETHEREUM_RPC_URL || process.env.ETH_RPC_URL,
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum-rpc.publicnode.com',
  ].filter(Boolean) as string[],
  '8453': [
    process.env.BASE_RPC_URL,
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://base-rpc.publicnode.com',
  ].filter(Boolean) as string[],
  '42161': [
    process.env.ARBITRUM_RPC_URL,
    'https://arb1.arbitrum.io/rpc',
    'https://arbitrum.llamarpc.com',
    'https://arbitrum-one-rpc.publicnode.com',
  ].filter(Boolean) as string[],
  '137': [
    process.env.POLYGON_RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc.ankr.com/polygon',
  ].filter(Boolean) as string[],
}

const SOLANA_RPC_PROVIDERS: Record<string, string[]> = {
  'mainnet-beta': [
    process.env.SOLANA_RPC_URL,
    'https://api.mainnet-beta.solana.com',
  ].filter(Boolean) as string[],
  'devnet': [
    process.env.SOLANA_DEVNET_RPC_URL,
    'https://api.devnet.solana.com',
  ].filter(Boolean) as string[],
}

// ============================================================================
// Fallback RPC Call
// ============================================================================

export interface RpcCallOptions {
  timeout?: number
  retries?: number
}

/**
 * Make an EVM JSON-RPC call with automatic provider fallback.
 */
export async function evmRpcCall(
  chainId: string,
  payload: { method: string; params: unknown[] },
  options: RpcCallOptions = {}
): Promise<unknown> {
  const { timeout = 10_000 } = options
  const providers = EVM_RPC_PROVIDERS[chainId]

  if (!providers || providers.length === 0) {
    throw new Error(`No RPC providers configured for chain ${chainId}`)
  }

  let lastError: Error | null = null

  for (const url of providers) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: payload.method,
          params: payload.params,
        }),
        signal: AbortSignal.timeout(timeout),
      })

      if (!res.ok) {
        lastError = new Error(`RPC returned ${res.status}`)
        continue
      }

      const data = (await res.json()) as { error?: { message?: string }; result?: unknown }

      if (data.error) {
        lastError = new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`)
        continue
      }

      return data.result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      continue
    }
  }

  throw new Error(
    `All ${providers.length} RPC providers failed for chain ${chainId}: ${lastError?.message}`
  )
}

/**
 * Make a Solana JSON-RPC call with automatic provider fallback.
 */
export async function solanaRpcCall(
  chainId: string,
  payload: { method: string; params: unknown[] },
  options: RpcCallOptions = {}
): Promise<unknown> {
  const { timeout = 10_000 } = options
  const providers = SOLANA_RPC_PROVIDERS[chainId] || SOLANA_RPC_PROVIDERS['mainnet-beta']

  if (!providers || providers.length === 0) {
    throw new Error(`No Solana RPC providers configured for ${chainId}`)
  }

  let lastError: Error | null = null

  for (const url of providers) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: payload.method,
          params: payload.params,
        }),
        signal: AbortSignal.timeout(timeout),
      })

      if (!res.ok) {
        lastError = new Error(`Solana RPC returned ${res.status}`)
        continue
      }

      const data = (await res.json()) as { error?: { message?: string }; result?: unknown }

      if (data.error) {
        lastError = new Error(`Solana RPC error: ${data.error.message || JSON.stringify(data.error)}`)
        continue
      }

      return data.result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      continue
    }
  }

  throw new Error(
    `All ${providers.length} Solana RPC providers failed for ${chainId}: ${lastError?.message}`
  )
}

/**
 * Get the primary RPC URL for an EVM chain (for cases where a URL is needed directly).
 */
export function getEvmRpcUrl(chainId: string): string | null {
  const providers = EVM_RPC_PROVIDERS[chainId]
  return providers?.[0] || null
}

/**
 * Get the primary Solana RPC URL.
 */
export function getSolanaRpcUrl(chainId: string = 'mainnet-beta'): string {
  const providers = SOLANA_RPC_PROVIDERS[chainId]
  return providers?.[0] || 'https://api.mainnet-beta.solana.com'
}