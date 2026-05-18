/**
 * SolanaService — Centralized Solana Infrastructure
 *
 * Single source of truth for all Solana interactions across the launchpad:
 * - Authority keypair management (load once, cache forever)
 * - RPC connection with failover
 * - Umi instance with signer attached
 * - Retry wrapper with exponential backoff
 * - Transaction confirmation utility
 *
 * Consumers: genesis.ts, streamflow.ts, index.ts, epoch-cron route
 */

import 'server-only'

import {
  Connection,
  Keypair,
  type TransactionSignature,
  type Commitment,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createSignerFromKeypair as umiSignerFromKeypair } from '@metaplex-foundation/umi'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { maskWalletAddress, summarizeError } from '@/lib/logging/safe-log'
import type { Umi } from '@metaplex-foundation/umi'
import type { GenesisApiConfig } from '@metaplex-foundation/genesis'

// ============================================================================
// Configuration
// ============================================================================

const PRIMARY_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const FALLBACK_RPC = process.env.SOLANA_RPC_URL_FALLBACK || 'https://api.mainnet-beta.solana.com'
const GENESIS_API_BASE = process.env.GENESIS_API_BASE_URL || 'https://api.metaplex.com'
const AUTHORITY_KEY = process.env.LAUNCH_AUTHORITY_KEY || process.env.EPOCH_AUTHORITY_KEY || ''

const DEFAULT_RETRY_OPTS: RetryOptions = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000 }
const DEFAULT_CONFIRM_TIMEOUT_MS = 60_000
const DEFAULT_COMMITMENT: Commitment = 'confirmed'

// ============================================================================
// Types
// ============================================================================

export interface RetryOptions {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

// ============================================================================
// Singletons (module-level, created lazily)
// ============================================================================

let _authority: Keypair | null | undefined // undefined = not loaded yet
let _connection: Connection | null = null
let _fallbackConnection: Connection | null = null
let _umi: Umi | null = null

// ============================================================================
// Authority Keypair
// ============================================================================

/**
 * Load the authority keypair from env vars. Cached after first call.
 * Returns null if not configured (callers should gracefully degrade).
 */
export function getAuthority(): Keypair | null {
  if (_authority !== undefined) return _authority
  if (!AUTHORITY_KEY) {
    _authority = null
    return null
  }
  try {
    _authority = Keypair.fromSecretKey(bs58.decode(AUTHORITY_KEY))
    return _authority
  } catch {
    console.error('[solana-service] Invalid authority key — check LAUNCH_AUTHORITY_KEY env var')
    _authority = null
    return null
  }
}

/** Quick check: are Solana on-chain operations possible? */
export function isConfigured(): boolean {
  return getAuthority() !== null
}

/** Get the authority's public key as a base58 string, or null */
export function getAuthorityAddress(): string | null {
  return getAuthority()?.publicKey.toBase58() ?? null
}

// ============================================================================
// RPC Connection
// ============================================================================

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(PRIMARY_RPC, {
      commitment: DEFAULT_COMMITMENT,
      confirmTransactionInitialTimeout: DEFAULT_CONFIRM_TIMEOUT_MS,
    })
  }
  return _connection
}

function getFallbackConnection(): Connection {
  if (!_fallbackConnection) {
    _fallbackConnection = new Connection(FALLBACK_RPC, {
      commitment: DEFAULT_COMMITMENT,
      confirmTransactionInitialTimeout: DEFAULT_CONFIRM_TIMEOUT_MS,
    })
  }
  return _fallbackConnection
}

// ============================================================================
// Umi Instance (with signer)
// ============================================================================

export const genesisConfig: GenesisApiConfig = {
  baseUrl: GENESIS_API_BASE,
}

/**
 * Get a Umi instance. If authority is configured, the signer is attached.
 * This means `createAndRegisterLaunch` works out of the box.
 */
export function getUmi(): Umi {
  if (!_umi) {
    _umi = createUmi(PRIMARY_RPC)
    const authority = getAuthority()
    if (authority) {
      const umiKeypair = fromWeb3JsKeypair(authority)
      const signer = umiSignerFromKeypair(_umi, umiKeypair)
      _umi = _umi.use({ install(umi) { umi.identity = signer; umi.payer = signer } })
    }
  }
  return _umi
}

// ============================================================================
// Retry with Exponential Backoff
// ============================================================================

/** Retryable error detection — transient RPC/network failures */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  // HTTP 429 (rate limit), 502/503/504 (server errors), timeouts, network errors
  return (
    msg.includes('429') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed') ||
    msg.includes('blockhash not found')
  )
}

/**
 * Execute an async function with retry + exponential backoff.
 * Only retries on transient errors (rate limits, timeouts, network issues).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {},
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_OPTS, ...opts }
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt === maxAttempts || !isRetryable(err)) throw lastError

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      const jitter = delay * (0.5 + Math.random() * 0.5)
      console.warn(
        `[solana-service] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. Retrying in ${Math.round(jitter)}ms`,
      )
      await new Promise((r) => setTimeout(r, jitter))
    }
  }

  throw lastError!
}

// ============================================================================
// Transaction Confirmation
// ============================================================================

/**
 * Confirm a transaction with timeout and RPC failover.
 * Tries primary RPC first, falls back to secondary on failure.
 */
export async function confirmTransaction(
  signature: TransactionSignature,
  commitment: Commitment = DEFAULT_COMMITMENT,
  timeoutMs: number = DEFAULT_CONFIRM_TIMEOUT_MS,
): Promise<void> {
  const conn = getConnection()

  try {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash(commitment)
    const result = await conn.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      commitment,
    )
    if (result.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`)
    }
  } catch (err) {
    // Failover: try fallback RPC for confirmation
    if (FALLBACK_RPC !== PRIMARY_RPC) {
      try {
        const fallback = getFallbackConnection()
        const { blockhash, lastValidBlockHeight } = await fallback.getLatestBlockhash(commitment)
        const result = await fallback.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          commitment,
        )
        if (result.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`)
        }
        return
      } catch {
        // Fallback also failed — throw original error
      }
    }
    throw err
  }
}

// ============================================================================
// USDC Constants
// ============================================================================

/** USDC mint on Solana mainnet */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

/** Convert human-readable USDC to smallest unit (6 decimals) */
export function usdcToLamports(amount: number): number {
  return Math.floor(amount * 1_000_000)
}

// ============================================================================
// Helius Webhook Management
// ============================================================================

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || ''
const HELIUS_WEBHOOK_ID = process.env.HELIUS_WEBHOOK_ID || ''

/**
 * Add a token mint address to the Helius webhook's monitored accounts.
 * Called after a new token is minted during agent activation.
 * No-op if Helius is not configured.
 */
export async function addMintToHeliusWebhook(tokenMint: string): Promise<boolean> {
  if (!HELIUS_API_KEY || !HELIUS_WEBHOOK_ID) return false

  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/webhooks/${HELIUS_WEBHOOK_ID}?api-key=${HELIUS_API_KEY}`,
    )
    if (!res.ok) throw new Error(`GET webhook failed: ${res.status}`)

    const webhook = await res.json()
    const existingAddresses: string[] = webhook.accountAddresses ?? []

    if (existingAddresses.includes(tokenMint)) return true // Already monitored

    const updateRes = await fetch(
      `https://api.helius.xyz/v0/webhooks/${HELIUS_WEBHOOK_ID}?api-key=${HELIUS_API_KEY}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...webhook,
          accountAddresses: [...existingAddresses, tokenMint],
        }),
      },
    )

    if (!updateRes.ok) throw new Error(`PUT webhook failed: ${updateRes.status}`)
    console.log('[solana-service] Added token to Helius webhook', {
      tokenMint: maskWalletAddress(tokenMint),
    })
    return true
  } catch (err) {
    console.error('[solana-service] Failed to update Helius webhook:', summarizeError(err))
    return false
  }
}

// ============================================================================
// Reset (for testing)
// ============================================================================

export function _resetForTesting(): void {
  _authority = undefined
  _connection = null
  _fallbackConnection = null
  _umi = null
}
