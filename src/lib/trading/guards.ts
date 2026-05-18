/**
 * Trading Guards — Kill Switch + Rate Limiting + Feature Gate
 *
 * Provides server-side checks that must pass before any trading operation:
 * 1. Feature flag check (AUTONOMOUS_TRADING)
 * 2. Global kill switch (system_config table)
 * 3. Per-user trading suspension check
 * 4. Rate limiting (distributed via Upstash Redis, in-memory fallback)
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit as checkDistributedRateLimit } from '@/lib/auth/rate-limit'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

// ============================================================================
// Types
// ============================================================================

export interface TradingGuardResult {
  allowed: boolean
  reason?: string
}

// ============================================================================
// Supabase
// ============================================================================

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ============================================================================
// Global Kill Switch
// ============================================================================

let killSwitchCache: { value: boolean; fetchedAt: number } | null = null
const KILL_SWITCH_TTL_MS = 10_000 // Cache for 10 seconds

/**
 * Check global trading kill switch from system_config table.
 * Cached for 10 seconds to avoid DB roundtrips on every trade.
 */
export async function isTradingGloballyEnabled(): Promise<boolean> {
  // Check cache first
  if (killSwitchCache && Date.now() - killSwitchCache.fetchedAt < KILL_SWITCH_TTL_MS) {
    return killSwitchCache.value
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'trading_global_enabled')
      .single()

    if (error || !data) {
      console.error('[TradingGuards] Failed to read kill switch:', error)
      // Fail closed: if we can't read the switch, disable trading
      killSwitchCache = { value: false, fetchedAt: Date.now() }
      return false
    }

    const enabled = data.value === true || data.value === 'true'
    killSwitchCache = { value: enabled, fetchedAt: Date.now() }
    return enabled
  } catch (err) {
    console.error('[TradingGuards] Kill switch check failed:', err)
    return false
  }
}

/**
 * Set global trading enabled/disabled (admin only)
 */
export async function setTradingGloballyEnabled(
  enabled: boolean,
  updatedBy?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('system_config')
      .upsert({
        key: 'trading_global_enabled',
        value: enabled,
        updated_by: updatedBy || null,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      return { success: false, error: error.message }
    }

    // Invalidate cache
    killSwitchCache = null
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ============================================================================
// Per-User Suspension Check
// ============================================================================

/**
 * Check if a user's trading is suspended
 */
export async function isUserTradingSuspended(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('profiles')
      .select('trading_suspended')
      .eq('id', userId)
      .single()

    if (error || !data) return false
    return data.trading_suspended === true
  } catch {
    return false
  }
}

// ============================================================================
// Rate Limit Presets for Trading Endpoints
// ============================================================================

export const TRADING_RATE_LIMITS = {
  /** PUT /api/trading/policy — 10 per minute */
  policyUpdate: { maxRequests: 10, windowMs: 60_000 },
  /** POST /api/wallet/session-signer/enable — 5 per 5 minutes */
  signerEnable: { maxRequests: 5, windowMs: 300_000 },
  /** POST /api/internal/trading/execute — 30 per minute per user */
  tradeExecute: { maxRequests: 30, windowMs: 60_000 },
  /** GET /api/trading/history — 60 per minute */
  historyRead: { maxRequests: 60, windowMs: 60_000 },
} as const

// ============================================================================
// Unified Pre-Trade Guard
// ============================================================================

/**
 * Run all pre-trade checks. Call this before any trading operation.
 *
 * Checks in order:
 * 1. Feature flag
 * 2. Global kill switch
 * 3. User suspension
 * 4. Rate limit
 */
export async function runPreTradeGuards(
  userId: string,
  endpoint: keyof typeof TRADING_RATE_LIMITS = 'tradeExecute'
): Promise<TradingGuardResult> {
  // 1. Feature flag (centralized in feature-flags.ts)
  if (!FEATURE_FLAGS.AUTONOMOUS_TRADING) {
    return { allowed: false, reason: 'Autonomous trading is not enabled (feature flag off)' }
  }

  // 2. Global kill switch
  const globalEnabled = await isTradingGloballyEnabled()
  if (!globalEnabled) {
    return { allowed: false, reason: 'Trading is globally disabled (kill switch)' }
  }

  // 3. User suspension
  const suspended = await isUserTradingSuspended(userId)
  if (suspended) {
    return { allowed: false, reason: 'Your trading access has been suspended by an administrator' }
  }

  // 4. Rate limit (distributed via Upstash Redis, in-memory fallback)
  const limits = TRADING_RATE_LIMITS[endpoint]
  const rl = await checkDistributedRateLimit(`trade:${endpoint}:${userId}`, limits)
  if (!rl.success) {
    return {
      allowed: false,
      reason: `Rate limit exceeded (${limits.maxRequests} requests per ${limits.windowMs / 1000}s). Try again later.`,
    }
  }

  return { allowed: true }
}