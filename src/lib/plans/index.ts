/**
 * Plans Access Layer
 * 
 * High-level functions for checking features and limits
 * Abstracts subscription complexity from application code
 */

import 'server-only'
import { cache } from 'react'
import {
  getOrgSubscription,
  getPlans,
  getPlanByName,
  getCurrentUsage,
  incrementUsage as dbIncrementUsage,
  checkUsageLimit as dbCheckUsageLimit,
} from '@/lib/db'
import { isInternalOrg } from '@/lib/auth/internal'
import { applyLaunchPlanPresentation, PLAN_DISPLAY_NAMES } from '@/lib/pricing/plans'

// ============================================================================
// Types
// ============================================================================

export interface Plan {
  id: string
  name: 'starter' | 'pro' | 'business'
  display_name: string
  description: string | null
  price_monthly_usd: number | null
  price_yearly_usd: number | null
  price_monthly_crypto: string | null
  price_yearly_crypto: string | null
  features: Record<string, boolean>
  limits: Record<string, number>
  is_active: boolean
  is_featured: boolean
  sort_order: number
}

export interface Subscription {
  subscription_id: string
  org_id: string
  plan_id: string
  plan_name: 'starter' | 'pro' | 'business'
  plan_display_name: string
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
  billing_period: 'monthly' | 'yearly'
  payment_method: 'stripe_card' | 'stripe_paypal' | 'crypto'
  current_period_start: string
  current_period_end: string
  features: Record<string, boolean>
  limits: Record<string, number>
}

export interface UsageStatus {
  current: number
  limit: number
  percentage: number
  allowed: boolean
  isUnlimited: boolean
}

// ============================================================================
// Plan Access
// ============================================================================

/**
 * Get all available plans
 * Cached per request
 */
export const getAllPlans = cache(async (): Promise<Plan[]> => {
  const plans = await getPlans()
  return plans.map((plan) => applyLaunchPlanPresentation(plan))
})

/**
 * Get specific plan by name
 * Cached per request
 */
export const getPlan = cache(async (planName: 'starter' | 'pro' | 'business'): Promise<Plan | null> => {
  const plan = await getPlanByName(planName)
  return plan ? applyLaunchPlanPresentation(plan) : null
})

// ============================================================================
// Subscription Access
// ============================================================================

/**
 * Active subscription statuses that grant feature access
 */
const ACTIVE_STATUSES: Subscription['status'][] = ['active', 'trialing']
const SUBSCRIPTION_CACHE_TTL_MS = 60_000
const USAGE_STATUS_CACHE_TTL_MS = 10_000
const subscriptionCache = new Map<string, {
  expiresAt: number
  value: Subscription | null
}>()
const subscriptionInflight = new Map<string, Promise<Subscription | null>>()
const usageStatusCache = new Map<string, {
  expiresAt: number
  value: UsageStatus
}>()
const usageStatusInflight = new Map<string, Promise<UsageStatus>>()

/**
 * Get organization's subscription
 * Only returns subscriptions with an active/trialing status.
 * Past-due, canceled, or paused subscriptions are treated as absent.
 * Cached per request.
 */
export const getSubscription = cache(async (orgId: string): Promise<Subscription | null> => {
  const cached = subscriptionCache.get(orgId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const existing = subscriptionInflight.get(orgId)
  if (existing) return existing

  const inflight = (async () => {
    const sub = await getOrgSubscription(orgId)
    if (!sub) return null

    // Only return subscriptions that grant access
    if (!ACTIVE_STATUSES.includes(sub.status)) {
      return null
    }

    return sub
  })()

  subscriptionInflight.set(orgId, inflight)
  try {
    const value = await inflight
    subscriptionCache.set(orgId, {
      expiresAt: Date.now() + SUBSCRIPTION_CACHE_TTL_MS,
      value,
    })
    return value
  } finally {
    subscriptionInflight.delete(orgId)
  }
})

// ============================================================================
// Feature Checks
// ============================================================================

/**
 * Check if organization has access to a feature
 * 
 * @example
 * ```ts
 * if (await hasFeature(orgId, 'ai_agents')) {
 *   // Show AI agents UI
 * }
 * ```
 */
export async function hasFeature(
  orgId: string,
  feature: string
): Promise<boolean> {
  // Internal orgs bypass all feature gates
  if (isInternalOrg(orgId)) return true

  const subscription = await getSubscription(orgId)

  if (!subscription) {
    return false // No subscription or inactive = no features
  }

  // Defense in depth: verify active status even though getSubscription already filters
  if (!ACTIVE_STATUSES.includes(subscription.status)) {
    return false
  }

  return subscription.features[feature] === true
}

/**
 * Require a feature (throws if not available)
 * 
 * @example
 * ```ts
 * await requireFeature(orgId, 'api_access')
 * // Code here only runs if feature available
 * ```
 */
export async function requireFeature(
  orgId: string,
  feature: string
): Promise<void> {
  const has = await hasFeature(orgId, feature)
  
  if (!has) {
    throw new Error(`Feature not available: ${feature}. Upgrade your plan.`)
  }
}

/**
 * Get all features for organization
 */
export async function getFeatures(orgId: string): Promise<Record<string, boolean>> {
  const subscription = await getSubscription(orgId)
  
  if (!subscription) {
    return {} // No subscription = no features
  }
  
  return subscription.features
}

// ============================================================================
// Usage & Limits
// ============================================================================

/**
 * Get usage status for a metric
 * 
 * @example
 * ```ts
 * const { current, limit, percentage, allowed } = await getUsageStatus(orgId, 'api_calls_monthly')
 * if (percentage > 80) {
 *   // Show warning
 * }
 * ```
 */
export async function getUsageStatus(
  orgId: string,
  metric: string
): Promise<UsageStatus> {
  // Internal orgs get unlimited usage
  if (isInternalOrg(orgId)) {
    return { current: 0, limit: -1, percentage: 0, allowed: true, isUnlimited: true }
  }

  const cacheKey = `${orgId}:${metric}`
  const cached = usageStatusCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const existing = usageStatusInflight.get(cacheKey)
  if (existing) return existing

  const inflight = computeUsageStatus(orgId, metric)
  usageStatusInflight.set(cacheKey, inflight)
  try {
    const value = await inflight
    usageStatusCache.set(cacheKey, {
      expiresAt: Date.now() + USAGE_STATUS_CACHE_TTL_MS,
      value,
    })
    return value
  } finally {
    usageStatusInflight.delete(cacheKey)
  }
}

async function computeUsageStatus(
  orgId: string,
  metric: string,
): Promise<UsageStatus> {
  const subscription = await getSubscription(orgId)

  if (!subscription) {
    // No subscription = starter (free) plan defaults
    // Fallback limits so new orgs aren't blocked before subscription row exists
    const starterLimits: Record<string, number> = {
      ai_queries_monthly: 100,
      api_calls_monthly: 1000,
      storage_gb: 1,
    }
    const fallbackLimit = starterLimits[metric] ?? 0
    const current = await getCurrentUsage(orgId, metric)
    const percentage = fallbackLimit > 0 ? Math.round((current / fallbackLimit) * 100) : 0
    return {
      current,
      limit: fallbackLimit,
      percentage,
      allowed: current < fallbackLimit,
      isUnlimited: false,
    }
  }

  const limit = subscription.limits[metric]
  
  // -1 means unlimited
  if (limit === -1) {
    return {
      current: 0,
      limit: -1,
      percentage: 0,
      allowed: true,
      isUnlimited: true,
    }
  }
  
  const current = await getCurrentUsage(orgId, metric)
  const percentage = limit > 0 ? Math.round((current / limit) * 100) : 0
  
  return {
    current,
    limit,
    percentage,
    allowed: current < limit,
    isUnlimited: false,
  }
}

/**
 * Check if usage limit has been exceeded
 * 
 * @example
 * ```ts
 * if (!(await checkLimit(orgId, 'api_calls_monthly'))) {
 *   throw new Error('API call limit exceeded')
 * }
 * ```
 */
export async function checkLimit(
  orgId: string,
  metric: string
): Promise<boolean> {
  if (isInternalOrg(orgId)) return true
  return dbCheckUsageLimit(orgId, metric)
}

/**
 * Require usage limit (throws if exceeded)
 * 
 * @example
 * ```ts
 * await requireLimit(orgId, 'api_calls_monthly')
 * // Code here only runs if under limit
 * ```
 */
export async function requireLimit(
  orgId: string,
  metric: string
): Promise<void> {
  const allowed = await checkLimit(orgId, metric)
  
  if (!allowed) {
    const status = await getUsageStatus(orgId, metric)
    throw new Error(
      `Usage limit exceeded for ${metric}. ` +
      `Current: ${status.current}, Limit: ${status.limit}. ` +
      `Upgrade your plan or wait for the next billing period.`
    )
  }
}

/**
 * Increment usage for a metric
 *
 * @param idempotencyKey  Dedup key to prevent double-charging on retries.
 *   Passed through to the DB RPC which skips duplicate keys within 24 h.
 *
 * @example
 * ```ts
 * await incrementUsage(orgId, 'api_calls_monthly', 1, requestId)
 * ```
 */
export async function incrementUsage(
  orgId: string,
  metric: string,
  amount: number = 1,
  idempotencyKey?: string
): Promise<void> {
  if (isInternalOrg(orgId)) return
  return dbIncrementUsage(orgId, metric, amount, idempotencyKey)
}

/**
 * Track usage and enforce limit (combined operation)
 * 
 * @example
 * ```ts
 * await trackUsage(orgId, 'api_calls_monthly')
 * // Increments usage AND throws if limit exceeded
 * ```
 */
export async function trackUsage(
  orgId: string,
  metric: string,
  amount: number = 1
): Promise<void> {
  // Check limit first
  await requireLimit(orgId, metric)
  
  // Increment usage
  await incrementUsage(orgId, metric, amount)
}

/**
 * Get all limits for organization
 */
export async function getLimits(orgId: string): Promise<Record<string, number>> {
  const subscription = await getSubscription(orgId)
  
  if (!subscription) {
    return {} // No subscription = no limits
  }
  
  return subscription.limits
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if organization is on free plan
 */
export async function isStarterPlan(orgId: string): Promise<boolean> {
  const subscription = await getSubscription(orgId)
  return subscription?.plan_name === 'starter'
}

/**
 * Check if organization is on pro plan
 */
export async function isProPlan(orgId: string): Promise<boolean> {
  const subscription = await getSubscription(orgId)
  return subscription?.plan_name === 'pro'
}

/**
 * Check if organization is on business plan
 */
export async function isBusinessPlan(orgId: string): Promise<boolean> {
  const subscription = await getSubscription(orgId)
  return subscription?.plan_name === 'business'
}

/**
 * Get plan display name
 */
export async function getPlanName(orgId: string): Promise<string> {
  const subscription = await getSubscription(orgId)
  return subscription?.plan_name ? PLAN_DISPLAY_NAMES[subscription.plan_name] : 'Starter'
}

/**
 * Check if subscription is active
 */
export async function isSubscriptionActive(orgId: string): Promise<boolean> {
  const subscription = await getSubscription(orgId)
  return subscription?.status === 'active' || subscription?.status === 'trialing'
}

/**
 * Check if subscription will be canceled at period end
 */
export async function willCancelAtPeriodEnd(orgId: string): Promise<boolean> {
  const _subscription = await getSubscription(orgId)
  // This would need to be added to the subscription data returned from DB
  // For now, return false
  return false
}

// ============================================================================
// Middleware Helper
// ============================================================================

/**
 * Middleware helper for API routes
 * Checks both feature access and usage limits
 * 
 * @example
 * ```ts
 * // In API route
 * await checkAccess(orgId, {
 *   feature: 'api_access',
 *   metric: 'api_calls_monthly'
 * })
 * ```
 */
export async function checkAccess(
  orgId: string,
  options: {
    feature?: string
    metric?: string
    incrementUsage?: boolean
  }
): Promise<void> {
  // Check feature if specified
  if (options.feature) {
    await requireFeature(orgId, options.feature)
  }
  
  // Check and optionally increment usage
  if (options.metric) {
    if (options.incrementUsage) {
      await trackUsage(orgId, options.metric)
    } else {
      await requireLimit(orgId, options.metric)
    }
  }
}

// ============================================================================
// Plan Comparison Helpers
// ============================================================================

/**
 * Compare features between plans
 * Useful for pricing page
 */
export async function comparePlans() {
  const plans = await getAllPlans()
  
  return plans.map(plan => ({
    name: plan.name,
    displayName: plan.display_name,
    description: plan.description,
    priceMonthly: plan.price_monthly_usd,
    priceYearly: plan.price_yearly_usd,
    features: plan.features,
    limits: plan.limits,
    isFeatured: plan.is_featured,
  }))
}

/**
 * Get upgrade path for organization
 * Returns next available plan
 */
export async function getUpgradePath(orgId: string): Promise<Plan | null> {
  const subscription = await getSubscription(orgId)
  
  if (!subscription) {
    // No subscription, suggest Pro
    return getPlan('pro')
  }

  switch (subscription.plan_name) {
    case 'starter':
      return getPlan('pro')
    case 'pro':
      return getPlan('business')
    case 'business':
      return null // Already on highest plan
    default:
      return null
  }
}

// ============================================================================
// Workspace Limits (Industry Standard)
// ============================================================================

/**
 * Check if user can create more workspaces
 * Returns {allowed, current, limit, upgrade} (Notion/Slack style)
 * 
 * @example
 * ```ts
 * const check = await canCreateWorkspace(userId)
 * if (!check.allowed) {
 *   return { error: `Workspace limit reached (${check.current}/${check.limit}). Upgrade to create more.` }
 * }
 * ```
 */
export async function canCreateWorkspace(userId: string): Promise<{
  allowed: boolean
  current: number
  limit: number
  upgrade?: {
    currentPlan: string
    suggestedPlan: string
    upgradeUrl: string
  }
}> {
  // Get user's workspaces
  const { getUserOrganizations } = await import('@/lib/db')
  const orgs = await getUserOrganizations(userId)
  const current = orgs.length
  
  // Get user's first org to check subscription (all orgs should have same user-level limit)
  // For now, we'll use a simple approach: workspace limits are per-user, not per-org
  // Free: 3 workspaces, Pro: 10, Enterprise: Unlimited
  
  // Check if user has ANY pro/enterprise org
  let highestPlan: 'starter' | 'pro' | 'business' = 'starter'

  for (const membership of orgs) {
    const org = Array.isArray(membership.organization)
      ? membership.organization[0]
      : membership.organization

    if (org?.id) {
      const subscription = await getSubscription(org.id)
      if (subscription?.plan_name === 'business') {
        highestPlan = 'business'
        break
      } else if (subscription?.plan_name === 'pro' && highestPlan === 'starter') {
        highestPlan = 'pro'
      }
    }
  }

  // Determine limit based on highest plan
  let limit: number
  switch (highestPlan) {
    case 'business':
      limit = -1 // Unlimited
      break
    case 'pro':
      limit = 10
      break
    case 'starter':
    default:
      limit = 3
      break
  }

  // Check if allowed
  const allowed = limit === -1 || current < limit

  // Prepare upgrade info if not allowed
  let upgrade
  if (!allowed) {
    const suggestedPlan = highestPlan === 'starter' ? 'pro' : 'business'
    upgrade = {
      currentPlan: highestPlan,
      suggestedPlan,
      upgradeUrl: '/pricing'
    }
  }
  
  return {
    allowed,
    current,
    limit,
    upgrade
  }
}

/**
 * Require workspace creation permission (throws if limit reached)
 * Industry standard: Clear error with upgrade prompt
 * 
 * @example
 * ```ts
 * await requireWorkspaceCreation(userId)
 * // Continues only if allowed, otherwise throws with upgrade info
 * ```
 */
export async function requireWorkspaceCreation(userId: string): Promise<void> {
  const check = await canCreateWorkspace(userId)
  
  if (!check.allowed) {
    const limitText = check.limit === -1 ? 'unlimited' : check.limit
    throw new Error(
      `Workspace limit reached (${check.current}/${limitText}). ` +
      `Upgrade to ${check.upgrade?.suggestedPlan.toUpperCase()} plan to create more workspaces.`
    )
  }
}
