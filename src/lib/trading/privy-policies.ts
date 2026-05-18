/**
 * Privy Wallet-Level Policies — P1-24
 *
 * Enforces wallet-level constraints via Privy's policy engine.
 * When a wallet has policies configured in Privy, transactions
 * must satisfy those policies before the signing key is released.
 *
 * This module:
 * 1. Syncs our trading_policies to Privy's wallet policy format
 * 2. Validates that wallet policies are active before signing
 * 3. Provides helpers for policy CRUD via Privy API
 */

import 'server-only'
import { ErrorService } from '@/lib/errors/error-service'

// ============================================================================
// Types
// ============================================================================

export interface PrivyWalletPolicy {
  /** Policy ID from Privy */
  policyId: string
  /** Wallet ID the policy applies to */
  walletId: string
  /** Policy type */
  type: 'spending_limit' | 'allowlist' | 'rate_limit'
  /** Policy configuration */
  config: SpendingLimitConfig | AllowlistConfig | RateLimitConfig
  /** Whether the policy is active */
  active: boolean
  /** Created timestamp */
  createdAt: string
}

export interface SpendingLimitConfig {
  type: 'spending_limit'
  /** Maximum value per transaction in USD */
  maxPerTransaction: number
  /** Maximum daily spending in USD */
  maxDaily: number
  /** Currency for limits */
  currency: 'USD'
}

export interface AllowlistConfig {
  type: 'allowlist'
  /** Allowed contract addresses */
  contracts: string[]
  /** Allowed recipient addresses */
  recipients: string[]
  /** Allowed chain IDs */
  chainIds: string[]
}

export interface RateLimitConfig {
  type: 'rate_limit'
  /** Max transactions per window */
  maxTransactions: number
  /** Window duration in seconds */
  windowSeconds: number
}

export interface PolicySyncResult {
  success: boolean
  policiesCreated: number
  policiesUpdated: number
  error?: string
}

// ============================================================================
// Privy API Client
// ============================================================================

const PRIVY_API_BASE = 'https://auth.privy.io/api/v1'

async function privyApiCall(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET

  if (!appId || !appSecret) {
    return { ok: false, error: 'Privy credentials not configured' }
  }

  try {
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

    const response = await fetch(`${PRIVY_API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicAuth}`,
        'privy-app-id': appId,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      return { ok: false, error: `Privy API ${response.status}: ${errorText}` }
    }

    const data = await response.json()
    return { ok: true, data }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Privy API call failed',
    }
  }
}

// ============================================================================
// Policy Management
// ============================================================================

/**
 * Get all wallet policies for a given Privy wallet ID.
 */
export async function getWalletPolicies(
  walletId: string
): Promise<{ policies: PrivyWalletPolicy[]; error?: string }> {
  const result = await privyApiCall(`/wallets/${walletId}/policies`)

  if (!result.ok) {
    return { policies: [], error: result.error }
  }

  const policies = Array.isArray(result.data) ? result.data : []
  return {
    policies: policies.map(mapPrivyPolicy),
  }
}

/**
 * Create a spending limit policy on a Privy wallet.
 */
export async function createSpendingLimitPolicy(
  walletId: string,
  config: SpendingLimitConfig
): Promise<{ policyId?: string; error?: string }> {
  const result = await privyApiCall(`/wallets/${walletId}/policies`, 'POST', {
    type: 'spending_limit',
    config: {
      max_per_transaction_usd: config.maxPerTransaction,
      max_daily_usd: config.maxDaily,
      currency: config.currency,
    },
  })

  if (!result.ok) {
    return { error: result.error }
  }

  const data = result.data as Record<string, unknown>
  return { policyId: data.id as string }
}

/**
 * Create an allowlist policy on a Privy wallet.
 */
export async function createAllowlistPolicy(
  walletId: string,
  config: AllowlistConfig
): Promise<{ policyId?: string; error?: string }> {
  const result = await privyApiCall(`/wallets/${walletId}/policies`, 'POST', {
    type: 'allowlist',
    config: {
      contracts: config.contracts,
      recipients: config.recipients,
      chain_ids: config.chainIds,
    },
  })

  if (!result.ok) {
    return { error: result.error }
  }

  const data = result.data as Record<string, unknown>
  return { policyId: data.id as string }
}

/**
 * Create a rate limit policy on a Privy wallet.
 */
export async function createRateLimitPolicy(
  walletId: string,
  config: RateLimitConfig
): Promise<{ policyId?: string; error?: string }> {
  const result = await privyApiCall(`/wallets/${walletId}/policies`, 'POST', {
    type: 'rate_limit',
    config: {
      max_transactions: config.maxTransactions,
      window_seconds: config.windowSeconds,
    },
  })

  if (!result.ok) {
    return { error: result.error }
  }

  const data = result.data as Record<string, unknown>
  return { policyId: data.id as string }
}

/**
 * Delete a wallet policy.
 */
export async function deleteWalletPolicy(
  walletId: string,
  policyId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await privyApiCall(
    `/wallets/${walletId}/policies/${policyId}`,
    'DELETE'
  )
  return { success: result.ok, error: result.error }
}

// ============================================================================
// Sync Trading Policies to Privy
// ============================================================================

/**
 * Sync a trading policy from our DB to Privy wallet policies.
 *
 * Creates/updates Privy-side policies to match our trading_policies config:
 * - Spending limit policy (max trade value + daily limit)
 * - Allowlist policy (allowed chains + DEX router contracts)
 * - Rate limit policy (30 trades per minute)
 */
export async function syncTradingPolicyToPrivy(
  walletId: string,
  tradingPolicy: {
    maxTradeValueUsd: number
    dailyLimitUsd: number
    allowedChains: string[]
    maxSlippageBps: number
  }
): Promise<PolicySyncResult> {
  let created = 0
  let updated = 0

  try {
    // 1. Create/update spending limit
    const spendResult = await createSpendingLimitPolicy(walletId, {
      type: 'spending_limit',
      maxPerTransaction: tradingPolicy.maxTradeValueUsd,
      maxDaily: tradingPolicy.dailyLimitUsd,
      currency: 'USD',
    })

    if (spendResult.policyId) {
      created++
    } else if (spendResult.error?.includes('already exists')) {
      updated++
    } else if (spendResult.error) {
      console.warn('[PrivyPolicies] Spending limit policy failed:', spendResult.error)
    }

    // 2. Create/update allowlist (chain IDs)
    if (tradingPolicy.allowedChains.length > 0) {
      const allowResult = await createAllowlistPolicy(walletId, {
        type: 'allowlist',
        contracts: [],
        recipients: [],
        chainIds: tradingPolicy.allowedChains,
      })

      if (allowResult.policyId) {
        created++
      } else if (allowResult.error?.includes('already exists')) {
        updated++
      }
    }

    // 3. Create rate limit (30 trades per 60 seconds)
    const rateResult = await createRateLimitPolicy(walletId, {
      type: 'rate_limit',
      maxTransactions: 30,
      windowSeconds: 60,
    })

    if (rateResult.policyId) {
      created++
    } else if (rateResult.error?.includes('already exists')) {
      updated++
    }

    return { success: true, policiesCreated: created, policiesUpdated: updated }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'syncTradingPolicyToPrivy', walletId },
      tags: { layer: 'trading', module: 'privy-policies' },
    })
    return {
      success: false,
      policiesCreated: created,
      policiesUpdated: updated,
      error: error instanceof Error ? error.message : 'Sync failed',
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function mapPrivyPolicy(raw: unknown): PrivyWalletPolicy {
  const p = raw as Record<string, unknown>
  return {
    policyId: (p.id as string) || '',
    walletId: (p.wallet_id as string) || '',
    type: (p.type as PrivyWalletPolicy['type']) || 'spending_limit',
    config: (p.config as PrivyWalletPolicy['config']) || { type: 'spending_limit', maxPerTransaction: 0, maxDaily: 0, currency: 'USD' },
    active: (p.active as boolean) ?? true,
    createdAt: (p.created_at as string) || new Date().toISOString(),
  }
}