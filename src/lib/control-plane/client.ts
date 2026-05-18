/**
 * Control-Plane Client
 *
 * Server-only module for communicating with the centralized control-plane
 * (TrustGate + MCPGate entitlements, plan sync, usage tracking).
 *
 * All functions are safe to call even when the control-plane is not configured —
 * they gracefully no-op (return null / 0) and never throw.
 */

import 'server-only'
import { fetchWithTimeout, readPositiveIntEnv } from '@/lib/http/fetch-timeout'

const CONTROL_PLANE_FALLBACK_WARN_TTL_MS = 60_000
const CONTROL_PLANE_FETCH_TIMEOUT_MS = 8_000
const lastFallbackWarningAt = new Map<string, number>()

// ============================================================================
// Types
// ============================================================================

export interface SyncSubscriptionPayload {
  tenant_id: string
  tenant_name?: string
  plan_name: string
  status: string
  stripe_subscription_id?: string
  stripe_customer_id?: string
  billing_period?: string
  current_period_start?: string
  current_period_end?: string
  // Generic provider fields (for non-Stripe providers)
  provider?: 'stripe' | 'nowpayments'
  provider_payment_id?: string
}

export interface UsageResult {
  metric: string
  value: number
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Shared fetch wrapper that adds Bearer token + Content-Type headers.
 * Returns the parsed JSON body, or null on any error.
 */
async function cpFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  const controlPlaneUrl = getControlPlaneUrl()
  if (!controlPlaneUrl) return null

  const url = `${controlPlaneUrl}${path}`

  try {
    const res = await fetchWithTimeout(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(getEntitlementsApiKey()
          ? { Authorization: `Bearer ${getEntitlementsApiKey()}` }
          : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    }, readPositiveIntEnv('CONTROL_PLANE_FETCH_TIMEOUT_MS', CONTROL_PLANE_FETCH_TIMEOUT_MS))

    if (!res.ok) {
      logControlPlaneFallback({
        method: options.method ?? 'GET',
        path,
        status: res.status,
        body: await res.text(),
      })
      return null
    }

    return (await res.json()) as T
  } catch (err) {
    logControlPlaneFallback({
      method: options.method ?? 'GET',
      path,
      error: err,
    })
    return null
  }
}

function getControlPlaneUrl(): string | null {
  const value = process.env.CONTROL_PLANE_URL?.trim()
  return value ? value.replace(/\/+$/, '') : null
}

function getEntitlementsApiKey(): string | null {
  const value = process.env.ENTITLEMENTS_API_KEY?.trim()
  return value || null
}

function logControlPlaneFallback(input: {
  method: string
  path: string
  status?: number
  body?: string
  error?: unknown
}): void {
  const key = `${input.method}:${input.path}:${input.status ?? 'network'}`
  const now = Date.now()
  const last = lastFallbackWarningAt.get(key) ?? 0
  if (now - last < CONTROL_PLANE_FALLBACK_WARN_TTL_MS) return
  lastFallbackWarningAt.set(key, now)

  const prefix = `[control-plane] ${input.method} ${input.path}`
  if (input.status !== undefined) {
    console.warn(`${prefix} returned ${input.status}; falling back to local entitlements`, {
      body: input.body?.slice(0, 500) ?? '',
    })
    return
  }

  console.warn(`${prefix} failed; falling back to local entitlements`, input.error)
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Sync a subscription state to the control-plane.
 * Fire-and-forget: catches all errors, logs them, and never throws.
 */
export async function syncSubscription(payload: SyncSubscriptionPayload): Promise<void> {
  if (!getControlPlaneUrl()) return

  try {
    await cpFetch('/v1/sync/subscription', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.warn('[control-plane] syncSubscription failed; continuing without control-plane sync', err)
  }
}

/**
 * Get entitlements (plan + features) for a tenant.
 * Returns parsed JSON or null on error.
 */
export async function getEntitlements(tenantId: string): Promise<Record<string, unknown> | null> {
  return cpFetch(`/v1/entitlements/${encodeURIComponent(tenantId)}`)
}

/**
 * List all plans from the control-plane.
 * Returns plans array or null on error.
 */
export async function getPlansFromCP(): Promise<unknown[] | null> {
  return cpFetch<unknown[]>('/v1/plans')
}

/**
 * Get a single plan by name from the control-plane.
 * Returns plan object or null on error.
 */
export async function getPlanFromCP(name: string): Promise<Record<string, unknown> | null> {
  return cpFetch(`/v1/plans/${encodeURIComponent(name)}`)
}

/**
 * Increment a usage metric for a tenant.
 * Returns { metric, value } or null on error.
 */
export async function incrementUsageCP(
  tenantId: string,
  metric: string,
  amount: number = 1,
): Promise<UsageResult | null> {
  return cpFetch<UsageResult>(
    `/v1/entitlements/${encodeURIComponent(tenantId)}/usage`,
    {
      method: 'POST',
      body: JSON.stringify({ metric, amount }),
    },
  )
}

/**
 * Get current usage for a metric.
 * Returns the numeric value, or 0 on error.
 */
export async function getUsageCP(tenantId: string, metric: string): Promise<number> {
  const result = await cpFetch<{ value: number }>(
    `/v1/entitlements/${encodeURIComponent(tenantId)}/usage/${encodeURIComponent(metric)}`,
  )
  return result?.value ?? 0
}
