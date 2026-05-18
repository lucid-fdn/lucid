/**
 * Entitlement Engine — Central decision point for all access checks.
 *
 * Backend is the source of truth for:
 * - Plan limits and feature gates
 * - Current usage
 * - Required plan for upgrade
 * - Upgrade target values and value propositions
 * - Reset dates for periodic quotas
 *
 * Every API route calls this instead of scattered checkLimit/hasFeature calls.
 * Returns a structured deny payload the frontend can render context-appropriately.
 */

import 'server-only'
import { getSubscription, getUsageStatus } from '@/lib/plans'
import { isInternalOrg } from '@/lib/auth/internal'
import { isSelfHosted } from '@/lib/deployment-mode'
import { PLAN_DEFAULTS, normalizeWorkspacePlanName, type WorkspacePlan } from '@/lib/access-control/types'
import { PLAN_DISPLAY_NAMES, PLAN_PRICES } from '@/lib/pricing/plans'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { allowsPreviewE2ERateLimitBypass } from '@/lib/env/e2e'
import type {
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

// ============================================================================
// Grace Period Configuration
// ============================================================================

/** Allow 10% overage for 24 hours before hard-blocking */
const GRACE_OVERAGE_PERCENT = 0.10
const GRACE_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours

// ============================================================================
// Rate Limit Configuration (per plan, per-minute burst protection)
// ============================================================================

const RATE_LIMIT_CONFIGS: Record<string, Record<string, { maxRequests: number; windowMs: number }>> = {
  ai_query: {
    starter:  { maxRequests: 10,  windowMs: 60_000 },
    pro:      { maxRequests: 30,  windowMs: 60_000 },
    business: { maxRequests: 100, windowMs: 60_000 },
  },
  api_call: {
    starter:  { maxRequests: 20,  windowMs: 60_000 },
    pro:      { maxRequests: 60,  windowMs: 60_000 },
    business: { maxRequests: 200, windowMs: 60_000 },
  },
}

// ============================================================================
// Action → Entitlement Mapping
// ============================================================================

interface ActionMapping {
  kind: EntitlementKind
  metric: string
  /** camelCase key in PLAN_DEFAULTS for upgrade target resolution */
  planKey: string
  featureGate?: string
  label: string
}

const ACTION_MAP: Record<EntitlementAction, ActionMapping> = {
  // Quotas (time-windowed)
  ai_query:           { kind: 'quota',    metric: 'ai_queries_monthly',  planKey: 'apiCallsPerMonth', label: 'AI Queries' },
  api_call:           { kind: 'quota',    metric: 'api_calls_monthly',   planKey: 'apiCallsPerMonth', label: 'API Calls' },
  // Capacities (static)
  upload_file:        { kind: 'capacity', metric: 'storage_gb',                   planKey: 'storageGB',              label: 'Storage' },
  install_plugin:     { kind: 'capacity', metric: 'max_plugins_per_assistant',    planKey: 'maxPluginsPerAssistant', label: 'Plugins per Assistant', featureGate: 'plugins_enabled' },
  install_plugin_tools: { kind: 'capacity', metric: 'max_plugin_tools_total',  planKey: 'maxPluginToolsTotal',    label: 'Plugin Tools', featureGate: 'plugins_enabled' },
  invite_member:      { kind: 'capacity', metric: 'max_members',                  planKey: 'maxMembers',             label: 'Team Members' },
  create_project:     { kind: 'capacity', metric: 'max_projects',                 planKey: 'maxProjects',            label: 'Projects' },
  create_workspace:   { kind: 'capacity', metric: 'max_workspaces',               planKey: 'maxWorkspaces',          label: 'Workspaces' },
  create_gateway_key: { kind: 'capacity', metric: 'max_gateway_keys',             planKey: 'maxGatewayKeys',         label: 'Gateway Keys', featureGate: 'gateway_keys_enabled' },
  // Features (boolean)
  use_plugins:  { kind: 'feature', metric: 'plugins_enabled', planKey: 'pluginsEnabled', label: 'Plugins' },
  use_video:    { kind: 'feature', metric: 'video_enabled',   planKey: 'videoEnabled',   label: 'Video Studio' },
  use_sso:      { kind: 'feature', metric: 'sso_enabled',     planKey: 'ssoEnabled',     label: 'SSO' },
  use_api:      { kind: 'feature', metric: 'api_access',      planKey: 'apiAccess',      label: 'API Access' },
  use_webhooks:        { kind: 'feature', metric: 'webhooks',                    planKey: 'webhooks',              label: 'Webhooks' },
  manage_gateway_keys: { kind: 'feature', metric: 'gateway_key_custom_limits', planKey: 'gatewayKeyCustomLimits', label: 'Gateway Key Management' },
}

// Fix: ai_query planKey should map to a dedicated entry — using a custom lookup
// since ai_queries_monthly and api_calls_monthly are separate quotas in DB but
// PLAN_DEFAULTS doesn't have ai_queries_monthly. We handle this with VALUE_PROPS.
// Correction: ai_queries_monthly limits come from DB (plans table), not PLAN_DEFAULTS.

// ============================================================================
// Value Propositions (backend-owned, not frontend)
// ============================================================================

const VALUE_PROPS: Record<string, Record<string, string>> = {
  ai_queries_monthly: {
    pro: '100x more AI queries per month',
    business: 'Unlimited AI queries',
  },
  api_calls_monthly: {
    pro: '50x more API calls per month',
    business: 'Unlimited API calls',
  },
  storage_gb: {
    pro: '20x more document storage',
    business: 'Unlimited storage',
  },
  max_members: {
    pro: 'Grow your team up to 25 members',
    business: 'Unlimited team members',
  },
  max_projects: {
    pro: 'Up to 50 projects',
    business: 'Unlimited projects',
  },
  max_workspaces: {
    pro: 'Up to 10 workspaces',
    business: 'Unlimited workspaces',
  },
  max_plugins_per_assistant: {
    pro: 'Add up to 10 plugins per assistant',
    business: 'Unlimited plugins per assistant',
  },
  max_gateway_keys: {
    pro: 'Up to 25 gateway keys',
    business: 'Unlimited gateway keys',
  },
  max_plugin_tools_total: {
    pro: 'Up to 50 plugin tools across assistants',
    business: 'Unlimited plugin tools',
  },
  gateway_key_custom_limits: {
    pro: 'Create and manage custom gateway keys',
    business: 'Create and manage custom gateway keys',
  },
  plugins_enabled: {
    pro: 'Add powerful AI plugins to your assistants',
    business: 'Add powerful AI plugins to your assistants',
  },
  video_enabled: {
    pro: 'Create AI-powered videos',
    business: 'Create AI-powered videos',
  },
  sso_enabled: {
    business: 'Enterprise SSO with SAML',
  },
  api_access: {
    pro: 'Full API access for integrations',
    business: 'Full API access for integrations',
  },
  webhooks: {
    pro: 'Webhook integrations',
    business: 'Unlimited webhook integrations',
  },
}

// Quota metrics whose limits come from DB, not PLAN_DEFAULTS.
// Provides fallback max values for upgrade target display.
const QUOTA_UPGRADE_MAX: Record<string, Record<string, number>> = {
  ai_queries_monthly: { starter: 100, pro: 10_000, business: -1 },
  api_calls_monthly:  { starter: 1_000, pro: 50_000, business: -1 },
}

// Map DB metric names to PLAN_DEFAULTS camelCase keys
const METRIC_TO_PLAN_KEY: Record<string, keyof typeof PLAN_DEFAULTS.starter> = {
  api_calls_monthly: 'apiCallsPerMonth',
  storage_gb: 'storageGB',
  max_members: 'maxMembers',
  max_projects: 'maxProjects',
  max_workspaces: 'maxWorkspaces',
  max_plugins_per_assistant: 'maxPluginsPerAssistant',
  max_plugin_tools_total: 'maxPluginToolsTotal',
  max_gateway_keys: 'maxGatewayKeys',
  gateway_key_custom_limits: 'gatewayKeyCustomLimits',
  plugins_enabled: 'pluginsEnabled',
  video_enabled: 'videoEnabled',
  sso_enabled: 'ssoEnabled',
  api_access: 'apiAccess',
  webhooks: 'webhooks',
}

// ============================================================================
// Core Evaluate Function
// ============================================================================

export async function evaluateEntitlement(input: EvaluateInput): Promise<EntitlementResult> {
  // Internal orgs bypass all entitlement checks
  if (isInternalOrg(input.orgId)) {
    return { allowed: true, status: 'normal' }
  }

  // Self-hosted deployments bypass all entitlement checks — all features unlocked
  if (isSelfHosted()) {
    return { allowed: true, status: 'normal' }
  }

  const mapping = ACTION_MAP[input.action]
  if (!mapping) {
    return { allowed: true, status: 'normal' }
  }

  const subscription = await getSubscription(input.orgId)
  const currentPlan = normalizeWorkspacePlanName(subscription?.plan_name)

  // No active subscription → starter defaults, with a clear message
  const noSubscription = !subscription

  // Check feature gate first (some actions require both feature + capacity)
  if (mapping.featureGate) {
    const featureEnabled = subscription
      ? subscription.features[mapping.featureGate] === true
      : false

    if (!featureEnabled) {
      return buildDeny({
        code: 'feature_gated',
        kind: 'feature',
        metric: mapping.featureGate,
        label: mapping.label,
        currentPlan,
        message: noSubscription
          ? `${mapping.label} requires a subscription`
          : `${mapping.label} requires a plan upgrade`,
      })
    }
  }

  // Rate limit check (burst protection) — runs before quota/capacity checks.
  // This catches per-minute bursts while quota catches monthly totals.
  const rlConfig = RATE_LIMIT_CONFIGS[input.action]?.[currentPlan]
  if (rlConfig) {
    const rlKey = `entitlement:${input.orgId}:${input.action}`
    const rl = await checkRateLimit(rlKey, rlConfig)
    if (!rl.success) {
      if (allowsPreviewE2ERateLimitBypass()) {
        return { allowed: true, status: 'normal' }
      }

      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000)
      return {
        allowed: false,
        status: 'blocked',
        deny: buildDenyPayload({
          code: 'rate_limited',
          kind: 'rate_limit',
          metric: mapping.metric,
          label: mapping.label,
          currentPlan,
          message: `Too many requests. Please wait ${retryAfter} seconds.`,
          resetAt: new Date(rl.resetAt).toISOString(),
        }),
      }
    }
  }

  switch (mapping.kind) {
    case 'feature':
      return evaluateFeature(mapping, subscription, currentPlan)
    case 'quota':
      return evaluateQuota(input.orgId, mapping, subscription, currentPlan, noSubscription)
    case 'capacity':
      return evaluateCapacity(mapping, input.currentUsage ?? 0, subscription, currentPlan)
    default:
      return { allowed: true, status: 'normal' }
  }
}

// ============================================================================
// Kind-Specific Evaluators
// ============================================================================

async function evaluateFeature(
  mapping: ActionMapping,
  subscription: Awaited<ReturnType<typeof getSubscription>>,
  currentPlan: WorkspacePlan,
): Promise<EntitlementResult> {
  const enabled = subscription
    ? subscription.features[mapping.metric] === true
    : false

  if (enabled) {
    return { allowed: true, status: 'normal' }
  }

  return buildDeny({
    code: 'feature_gated',
    kind: 'feature',
    metric: mapping.metric,
    label: mapping.label,
    currentPlan,
    message: `${mapping.label} is not available on your current plan`,
  })
}

async function evaluateQuota(
  orgId: string,
  mapping: ActionMapping,
  subscription: Awaited<ReturnType<typeof getSubscription>>,
  currentPlan: WorkspacePlan,
  noSubscription: boolean,
): Promise<EntitlementResult> {
  const usage = await getUsageStatus(orgId, mapping.metric)

  if (usage.isUnlimited) {
    return { allowed: true, status: 'normal' }
  }

  const status = computeStatus(usage.current, usage.limit)

  if (usage.allowed) {
    return { allowed: true, status }
  }

  // Compute reset date (1st of next month for monthly quotas)
  const now = new Date()
  const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  // Grace period: allow 10% overage within 24h of first exceeding the limit.
  // Starter plan doesn't get grace (encourages upgrade).
  if (currentPlan !== 'starter' && usage.limit > 0) {
    const graceMax = Math.ceil(usage.limit * (1 + GRACE_OVERAGE_PERCENT))
    if (usage.current < graceMax) {
      // Check if we're within the grace window (period end - 24h is not right;
      // we allow 24h from when they first exceeded the limit).
      // Simplified: within the billing period + overage allowance.
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      const graceDeadline = new Date(periodEnd.getTime() + GRACE_WINDOW_MS)
      if (now < graceDeadline) {
        return {
          allowed: true,
          status: 'grace',
        }
      }
    }
  }

  return buildDeny({
    code: 'quota_exceeded',
    kind: 'quota',
    metric: mapping.metric,
    label: mapping.label,
    currentPlan,
    current: usage.current,
    max: usage.limit,
    resetAt,
    message: noSubscription
      ? `${mapping.label} limit reached. Subscribe to get more.`
      : `Monthly ${mapping.label.toLowerCase()} limit reached`,
  })
}

function evaluateCapacity(
  mapping: ActionMapping,
  currentUsage: number,
  subscription: Awaited<ReturnType<typeof getSubscription>>,
  currentPlan: WorkspacePlan,
): EntitlementResult {
  // Resolve limit from subscription or plan defaults
  let limit: number

  if (subscription) {
    const dbLimit = subscription.limits[mapping.metric]
    if (dbLimit === -1 || dbLimit === undefined) {
      // -1 means unlimited, undefined means use defaults
      if (dbLimit === -1) {
        return { allowed: true, status: 'normal' }
      }
      const defaults = PLAN_DEFAULTS[currentPlan]
      const planKey = METRIC_TO_PLAN_KEY[mapping.metric]
      limit = planKey ? (defaults[planKey] as number) : Infinity
    } else {
      limit = dbLimit
    }
  } else {
    const defaults = PLAN_DEFAULTS.starter
    const planKey = METRIC_TO_PLAN_KEY[mapping.metric]
    limit = planKey ? (defaults[planKey] as number) : Infinity
  }

  if (limit === Infinity || limit === -1) {
    return { allowed: true, status: 'normal' }
  }

  const status = computeStatus(currentUsage, limit)

  if (currentUsage < limit) {
    return { allowed: true, status }
  }

  return {
    allowed: false,
    status: 'blocked',
    deny: buildDenyPayload({
      code: 'capacity_exceeded',
      kind: 'capacity',
      metric: mapping.metric,
      label: mapping.label,
      currentPlan,
      current: currentUsage,
      max: limit,
      message: `${mapping.label} limit reached (${currentUsage}/${limit})`,
    }),
  }
}

// ============================================================================
// Deny Payload Builder
// ============================================================================

interface DenyInput {
  code: EntitlementCode
  kind: EntitlementKind
  metric: string
  label: string
  currentPlan: WorkspacePlan
  current?: number
  max?: number
  resetAt?: string
  message: string
}

function buildDeny(input: DenyInput): EntitlementResult {
  return {
    allowed: false,
    status: 'blocked',
    deny: buildDenyPayload(input),
  }
}

function buildDenyPayload(input: DenyInput): EntitlementDeny {
  const upgradeTarget = resolveUpgradeTarget(input.currentPlan, input.metric)

  return {
    type: 'entitlement_error',
    code: input.code,
    message: input.message,
    entitlement: {
      metric: input.metric,
      kind: input.kind,
      current: input.current,
      max: input.max,
      resetAt: input.resetAt,
      requiredPlan: upgradeTarget?.plan || 'pro',
      upgradeTarget,
    },
    action: resolveAction(input.currentPlan, input.code, upgradeTarget),
  }
}

function resolveUpgradeTarget(currentPlan: WorkspacePlan, metric: string): UpgradeTarget | null {
  const nextPlan: WorkspacePlan | null =
    currentPlan === 'starter' ? 'pro' :
    currentPlan === 'pro' ? 'business' :
    null

  if (!nextPlan) return null // already on business

  // Quota metrics use dedicated map (DB-driven, not in PLAN_DEFAULTS)
  let max: number | undefined
  const quotaMax = QUOTA_UPGRADE_MAX[metric]
  if (quotaMax) {
    max = quotaMax[nextPlan]
  } else {
    // Capacity/feature metrics use PLAN_DEFAULTS
    const nextDefaults = PLAN_DEFAULTS[nextPlan]
    const planKey = METRIC_TO_PLAN_KEY[metric]
    const nextValue = planKey ? (nextDefaults[planKey] as number | boolean) : undefined
    if (typeof nextValue === 'number') {
      max = nextValue === Infinity ? -1 : nextValue
    }
  }

  const valueProp = VALUE_PROPS[metric]?.[nextPlan]
    || `Upgrade to ${PLAN_DISPLAY_NAMES[nextPlan]}`

  return {
    plan: nextPlan,
    displayName: PLAN_DISPLAY_NAMES[nextPlan],
    max,
    priceMonthly: PLAN_PRICES[nextPlan].monthly,
    valueProp,
  }
}

function resolveAction(
  currentPlan: WorkspacePlan,
  code: EntitlementCode,
  upgradeTarget: UpgradeTarget | null,
): EntitlementDeny['action'] {
  // Business plan users have no upgrade path — contact sales
  if (currentPlan === 'business' || !upgradeTarget) {
    return { kind: 'contact_sales' }
  }

  // Rate limits → wait, don't upgrade
  if (code === 'rate_limited') {
    return { kind: 'wait', retryAfter: 60 }
  }

  return {
    kind: 'upgrade',
    checkoutPlan: upgradeTarget.plan,
  }
}

// ============================================================================
// Status Helpers
// ============================================================================

function computeStatus(current: number, max: number): EntitlementStatus {
  if (max === 0) return 'blocked'
  if (max < 0) return 'normal' // -1 = unlimited
  const pct = current / max
  if (pct >= 1 + GRACE_OVERAGE_PERCENT) return 'blocked'
  if (pct >= 1) return 'grace'
  if (pct >= 0.95) return 'warning_95'
  if (pct >= 0.80) return 'warning_80'
  return 'normal'
}

// ============================================================================
// Bulk Status (for status endpoint)
// ============================================================================

/** Metrics to include in the status endpoint */
const STATUS_METRICS: Array<{ metric: string; kind: EntitlementKind; label: string }> = [
  { metric: 'ai_queries_monthly', kind: 'quota', label: 'AI Queries' },
  { metric: 'api_calls_monthly', kind: 'quota', label: 'API Calls' },
  { metric: 'storage_gb', kind: 'capacity', label: 'Storage' },
]

export async function getEntitlementStatus(orgId: string): Promise<EntitlementStatusResponse> {
  if (isInternalOrg(orgId)) {
    return {
      plan: 'internal',
      planDisplayName: 'Internal',
      items: STATUS_METRICS.map(m => ({
        metric: m.metric,
        kind: m.kind,
        current: 0,
        max: -1,
        status: 'normal' as EntitlementStatus,
        isUnlimited: true,
      })),
    }
  }

  const subscription = await getSubscription(orgId)
  const currentPlan = normalizeWorkspacePlanName(subscription?.plan_name)

  const items: EntitlementStatusItem[] = await Promise.all(
    STATUS_METRICS.map(async (m) => {
      const usage = await getUsageStatus(orgId, m.metric)
      const now = new Date()
      const resetAt = m.kind === 'quota'
        ? new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
        : undefined

      return {
        metric: m.metric,
        kind: m.kind,
        current: usage.current,
        max: usage.limit,
        status: usage.isUnlimited ? 'normal' as EntitlementStatus : computeStatus(usage.current, usage.limit),
        resetAt,
        isUnlimited: usage.isUnlimited,
      }
    })
  )

  return {
    plan: currentPlan,
    planDisplayName: PLAN_DISPLAY_NAMES[currentPlan] || currentPlan,
    items,
  }
}
