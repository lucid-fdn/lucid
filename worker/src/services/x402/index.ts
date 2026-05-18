/**
 * x402 Payment Service for Worker
 *
 * Enables agents to pay for x402-protected APIs automatically.
 * Uses Privy signing via the internal API (no private keys in worker).
 *
 * Architecture:
 *   Agent HTTP call → x402 fetch wrapper → 402 detected →
 *   signTypedData proxy (worker → main app → Privy HSM) →
 *   retry with X-PAYMENT header → facilitator settles onchain
 *
 * Privy is an internal implementation detail — never exposed to users.
 */

import { signAgentWalletTypedData } from '../session-signer/index.js'

// ============================================================================
// Types
// ============================================================================

export interface X402Config {
  /** Assistant ID for wallet resolution */
  assistantId: string
  /** EVM wallet address (from agent_wallets) */
  walletAddress: string
  /** Max spend per request in USDC (human-readable, e.g. "1.00"). Default: "1.00" */
  maxPerRequest?: string
}

/** Default max spend per x402 payment: $1 USDC */
const DEFAULT_MAX_PER_REQUEST = '1.00'
/** USDC uses 6 decimals */
const USDC_DECIMALS = 6

// ============================================================================
// Custom x402 Account Adapter
// ============================================================================

/**
 * Creates a viem-compatible Account that proxies signTypedData
 * to the main app's internal API (which uses Privy HSM).
 *
 * This is the bridge between x402's client SDK (which expects a local signer)
 * and our architecture (where signing happens server-side via Privy).
 */
function createProxyAccount(assistantId: string, address: string, maxPerRequest: string) {
  const maxAmountRaw = BigInt(
    Math.round(parseFloat(maxPerRequest) * 10 ** USDC_DECIMALS)
  )

  return {
    address: address as `0x${string}`,
    type: 'local' as const,

    async signTypedData(typedData: Record<string, unknown>): Promise<`0x${string}`> {
      // Enforce spend limit before signing — prevents malicious APIs from draining wallet
      const message = typedData.message as Record<string, unknown> | undefined
      if (message?.value !== undefined) {
        const requestedAmount = BigInt(String(message.value))
        if (requestedAmount > maxAmountRaw) {
          throw new Error(
            `x402 payment rejected: requested ${requestedAmount} exceeds max ${maxAmountRaw} (${maxPerRequest} USDC)`
          )
        }
      }

      const result = await signAgentWalletTypedData(assistantId, typedData)
      if (!result.success || !result.signature) {
        throw new Error(`x402 signing failed: ${result.error || 'Unknown error'}`)
      }
      return result.signature as `0x${string}`
    },

    // x402 only uses signTypedData — stubs for interface compliance
    async signMessage(): Promise<`0x${string}`> {
      throw new Error('signMessage not supported for x402 proxy accounts')
    },
    async signTransaction(): Promise<`0x${string}`> {
      throw new Error('signTransaction not supported — use session-signer service')
    },
  }
}

// ============================================================================
// x402-Wrapped Fetch
// ============================================================================

/**
 * Create a fetch function that automatically handles x402 payments.
 *
 * When the target API returns 402 Payment Required:
 * 1. Parses payment requirements from response headers
 * 2. Signs a payment authorization via Privy (proxied through main app)
 * 3. Retries with PAYMENT-SIGNATURE header
 * 4. Facilitator (Coinbase) settles the payment onchain
 *
 * @example
 * ```ts
 * const fetchWithPayment = createX402Fetch({
 *   assistantId: 'asst_xxx',
 *   walletAddress: '0x...',
 *   maxPerRequest: '5.00',
 * })
 * const response = await fetchWithPayment('https://paid-api.com/data')
 * ```
 */
export async function createX402Fetch(config: X402Config) {
  // Dynamic import to avoid bundling x402 when not used
  const { wrapFetchWithPayment } = await import('@x402/fetch')
  const { x402Client } = await import('@x402/fetch')
  const { ExactEvmScheme } = await import('@x402/evm/exact/client')

  const maxPerRequest = config.maxPerRequest || DEFAULT_MAX_PER_REQUEST
  const proxyAccount = createProxyAccount(config.assistantId, config.walletAddress, maxPerRequest)

  const client = new x402Client()
  // Register for all EVM networks (Base, Ethereum, Arbitrum, etc.)
  client.register('eip155:*', new ExactEvmScheme(proxyAccount as never))

  return wrapFetchWithPayment(fetch, client)
}

/**
 * One-shot x402 fetch — creates client, makes request, returns response.
 * Use this for occasional x402 calls. For frequent calls, use createX402Fetch()
 * and reuse the returned fetch function.
 */
export async function x402Fetch(
  config: X402Config,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const fetchWithPayment = await createX402Fetch(config)
  return fetchWithPayment(url, init)
}
