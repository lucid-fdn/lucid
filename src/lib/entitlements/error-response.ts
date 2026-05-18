/**
 * Entitlement Error Response Builder
 *
 * Converts entitlement deny payloads into standardized NextResponse objects.
 * All API routes use this instead of hand-crafted error JSON.
 */

import 'server-only'
import { NextResponse } from 'next/server'
import type { EntitlementDeny, EntitlementResult } from './types'
import { ErrorService } from '@/lib/errors/error-service'

/**
 * Build a NextResponse from an entitlement deny payload.
 *
 * Status codes:
 * - 429 for quota_exceeded and rate_limited (client can retry)
 * - 403 for feature_gated and capacity_exceeded (needs upgrade)
 */
export function entitlementDenyResponse(deny: EntitlementDeny): NextResponse {
  const status = deny.code === 'quota_exceeded' || deny.code === 'rate_limited' ? 429 : 403

  const headers: Record<string, string> = {
    'X-Entitlement-Metric': deny.entitlement.metric,
    'X-Entitlement-Code': deny.code,
  }

  if (deny.action.retryAfter) {
    headers['Retry-After'] = String(deny.action.retryAfter)
  }

  return NextResponse.json({ error: deny }, { status, headers })
}

/** Structured context passed alongside the deny for analytics/logging. */
interface GuardContext {
  /** The org being checked */
  orgId?: string
  /** The route or component that triggered the check */
  route?: string
}

/**
 * Guard helper — returns a deny response if the result is not allowed.
 * Returns null if allowed (caller should proceed).
 *
 * Emits a structured log on every deny so we can track entitlement
 * denial patterns, frequency, and upgrade conversion opportunities.
 *
 * Usage:
 *   const guard = guardEntitlement(result, { orgId, route: '/api/ai/chat' })
 *   if (guard) return guard
 *   // ... proceed with action
 */
export function guardEntitlement(
  result: EntitlementResult,
  ctx?: GuardContext,
): NextResponse | null {
  if (result.allowed || !result.deny) return null

  const deny = result.deny

  // Structured analytics log — queryable by code, metric, plan, org
  ErrorService.captureException(
    new Error(`Entitlement denied: ${deny.code} on ${deny.entitlement.metric}`),
    {
      severity: 'warning',
      context: {
        event: 'entitlement_deny',
        code: deny.code,
        metric: deny.entitlement.metric,
        kind: deny.entitlement.kind,
        current: deny.entitlement.current,
        max: deny.entitlement.max,
        requiredPlan: deny.entitlement.requiredPlan,
        actionKind: deny.action.kind,
        checkoutPlan: deny.action.checkoutPlan,
        orgId: ctx?.orgId,
        route: ctx?.route,
      },
      tags: {
        layer: 'entitlements',
        code: deny.code,
        metric: deny.entitlement.metric,
      },
    },
  )

  return entitlementDenyResponse(deny)
}
