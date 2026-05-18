/**
 * Entitlement System Types
 *
 * Shared between server (evaluate) and client (rendering).
 * Backend is the source of truth for limits, plans, and decisions.
 * Frontend only handles presentation.
 */

// ============================================================================
// Entitlement Kinds
// ============================================================================

/** The category of entitlement being checked */
export type EntitlementKind = 'feature' | 'capacity' | 'quota' | 'rate_limit'

/** Error codes returned in deny payloads */
export type EntitlementCode =
  | 'feature_gated'
  | 'capacity_exceeded'
  | 'quota_exceeded'
  | 'rate_limited'

/**
 * Threshold status for proactive warnings.
 * - normal: under 80%
 * - warning_80: 80-94%
 * - warning_95: 95-99%
 * - grace: at 100-110% (allowed temporarily via grace period)
 * - blocked: over limit (or past grace window)
 */
export type EntitlementStatus = 'normal' | 'warning_80' | 'warning_95' | 'grace' | 'blocked'

// ============================================================================
// Actions (what the user is trying to do)
// ============================================================================

export type EntitlementAction =
  // Quota-checked (time-windowed counters)
  | 'ai_query'
  | 'api_call'
  // Capacity-checked (static counts)
  | 'upload_file'
  | 'install_plugin'
  | 'install_plugin_tools'
  | 'invite_member'
  | 'create_project'
  | 'create_workspace'
  | 'create_gateway_key'
  // Feature-gated (boolean access)
  | 'use_plugins'
  | 'use_video'
  | 'use_sso'
  | 'use_api'
  | 'use_webhooks'
  | 'manage_gateway_keys'

// ============================================================================
// Evaluate Input / Output
// ============================================================================

export interface EvaluateInput {
  orgId: string
  action: EntitlementAction
  /** Required for capacity checks — the current count */
  currentUsage?: number
}

export interface UpgradeTarget {
  plan: string
  displayName: string
  max?: number
  priceMonthly: number
  valueProp: string
}

export interface EntitlementDeny {
  type: 'entitlement_error'
  code: EntitlementCode
  message: string
  entitlement: {
    metric: string
    kind: EntitlementKind
    current?: number
    max?: number
    resetAt?: string
    requiredPlan: string
    upgradeTarget: UpgradeTarget | null
  }
  action: {
    kind: 'upgrade' | 'wait' | 'contact_sales'
    checkoutPlan?: string
    retryAfter?: number
  }
}

export interface EntitlementResult {
  allowed: boolean
  status: EntitlementStatus
  deny?: EntitlementDeny
}

// ============================================================================
// Status Endpoint Response
// ============================================================================

export interface EntitlementStatusItem {
  metric: string
  kind: EntitlementKind
  current: number
  max: number
  status: EntitlementStatus
  resetAt?: string
  isUnlimited: boolean
}

export interface EntitlementStatusResponse {
  plan: string
  planDisplayName: string
  items: EntitlementStatusItem[]
}
