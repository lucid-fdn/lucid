import 'server-only'

/**
 * Entitlement System — Public API
 *
 * Central access check for all plan limits, feature gates, and usage quotas.
 *
 * Usage (in API routes):
 *   import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
 *
 *   const result = await evaluateEntitlement({ orgId, action: 'ai_query' })
 *   const guard = guardEntitlement(result)
 *   if (guard) return guard
 *   // ... proceed
 */

export { evaluateEntitlement, getEntitlementStatus } from './evaluate'
export { entitlementDenyResponse, guardEntitlement } from './error-response'
export type {
  EntitlementAction,
  EntitlementCode,
  EntitlementDeny,
  EntitlementKind,
  EntitlementResult,
  EntitlementStatus,
  EntitlementStatusItem,
  EntitlementStatusResponse,
  EvaluateInput,
  UpgradeTarget,
} from './types'
