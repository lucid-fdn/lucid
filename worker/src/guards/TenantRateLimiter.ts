/**
 * TenantRateLimiter — Per-tenant message rate limiting via DB token bucket.
 *
 * Calls the `consume_rate_token` Postgres RPC function (migration 057)
 * for atomic token consumption with refill logic.
 *
 * Accepts string-based tenantKey (canonical key model) or falls back to
 * ANON_TENANT_KEY for unauthenticated users.
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §2.2
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ANON_USER_SUFFIX } from '../utils/tenant-keys.js'
import { redact } from '../utils/pii-redactor.js'

/** @deprecated Use tenantKey string from tenant-keys.ts instead */
export const ANON_TENANT_ID = '00000000-0000-0000-0000-000000000000'

/** String-based anon key for canonical key model */
export const ANON_TENANT_KEY = `__global__:default:default:${ANON_USER_SUFFIX}`

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs?: number
}

export class TenantRateLimiter {
  constructor(
    private supabase: SupabaseClient,
    private defaultMaxTokens: number = 20,
    private defaultRefillIntervalSec: number = 60
  ) {}

  /**
   * Try to consume a rate token for a tenant.
   * Accepts canonical tenantKey (string) or legacy UUID tenant_id.
   * Returns whether the request is allowed and remaining tokens.
   */
  /**
   * Atomic dual-bucket consume: tenant + user in one transaction.
   * Uses consume_rate_tokens_dual RPC (migration 065).
   * All-or-nothing: if either bucket rejects, neither is decremented.
   */
  async tryConsumeDual(
    tenantKey: string,
    userKey?: string,
    cost: number = 1
  ): Promise<RateLimitResult & { blockedBy?: 'tenant' | 'user'; tenantRemaining?: number; userRemaining?: number }> {
    const effectiveTenantKey = tenantKey || ANON_TENANT_KEY
    // For anonymous users, scope to tenant (tenantKey:__anon__), never global.
    const effectiveUserKey = userKey || `${effectiveTenantKey}:${ANON_USER_SUFFIX}`
    const isAnon = effectiveTenantKey === ANON_TENANT_KEY || effectiveTenantKey === ANON_TENANT_ID
    const tenantMaxTokens = isAnon
      ? Math.max(5, Math.floor(this.defaultMaxTokens / 4))
      : this.defaultMaxTokens
    const userMaxTokens = Math.max(3, Math.floor(tenantMaxTokens / 2)) // User bucket is stricter

    try {
      const { data, error } = await this.supabase.rpc('consume_rate_tokens_dual', {
        p_tenant_key: effectiveTenantKey,
        p_user_key: effectiveUserKey,
        p_tenant_bucket_key: 'msg_per_min',
        p_user_bucket_key: 'msg_per_min_user',
        p_cost: cost,
        p_tenant_max_tokens: tenantMaxTokens,
        p_user_max_tokens: userMaxTokens,
        p_refill_interval_sec: this.defaultRefillIntervalSec,
      })

      if (error) {
        // Fail open — don't block if RPC is unavailable (e.g. migration not yet applied)
        console.warn('[rate-limit] consume_rate_tokens_dual RPC error (failing open):', redact(error.message))
        return { allowed: true, remaining: -1 }
      }

      return {
        allowed: data.allowed,
        remaining: Math.min(data.tenant_remaining ?? -1, data.user_remaining ?? -1),
        retryAfterMs: data.retry_after_ms,
        blockedBy: data.blocked_by ?? undefined,
        tenantRemaining: data.tenant_remaining,
        userRemaining: data.user_remaining,
      }
    } catch (err) {
      console.warn('[rate-limit] Unexpected dual-bucket error (failing open):', err)
      return { allowed: true, remaining: -1 }
    }
  }

  /**
   * Try to consume a rate token for a tenant (single bucket).
   * Accepts canonical tenantKey (string) or legacy UUID tenant_id.
   * Returns whether the request is allowed and remaining tokens.
   */
  async tryConsume(
    tenantId: string | null,
    bucketKey: string = 'msg_per_min',
    cost: number = 1
  ): Promise<RateLimitResult> {
    // Use anon key for null/empty tenant IDs
    const effectiveTenantId = tenantId || ANON_TENANT_KEY
    const isAnon = effectiveTenantId === ANON_TENANT_KEY || effectiveTenantId === ANON_TENANT_ID
    const maxTokens = isAnon
      ? Math.max(5, Math.floor(this.defaultMaxTokens / 4))  // Stricter for anon
      : this.defaultMaxTokens

    try {
      const { data, error } = await this.supabase.rpc('consume_rate_token', {
        p_tenant_id: effectiveTenantId,
        p_bucket_key: bucketKey,
        p_cost: cost,
        p_max_tokens: maxTokens,
        p_refill_interval_sec: this.defaultRefillIntervalSec,
      })

      if (error) {
        // Fail open — don't block requests if rate limiting DB is down
        console.warn(`[rate-limit] RPC error (failing open): ${error.message}`)
        return { allowed: true, remaining: -1 }
      }

      return {
        allowed: data.allowed,
        remaining: data.remaining,
        retryAfterMs: data.retry_after_ms,
      }
    } catch (err) {
      // Fail open on unexpected errors
      console.warn('[rate-limit] Unexpected error (failing open):', err)
      return { allowed: true, remaining: -1 }
    }
  }
}
