/**
 * Access Control - Server-Only Functions
 * These functions can only be used in Server Components
 */

import 'server-only'
import { cache } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeWorkspacePlanName } from './types'
import type { WorkspacePlan, WorkspaceRole, PlanLimits, RolePermissions } from './types'
import { resolvePlanLimits, ROLE_PERMISSIONS } from './types'
import { cacheStore } from '@/lib/auth/cache'
import { redactLogMetadata } from '@/lib/logging/safe-log'

const VALID_ROLES: ReadonlySet<string> = new Set<WorkspaceRole>(['owner', 'admin', 'member', 'guest'])
const ROLE_CACHE_TTL_MS = 5 * 60_000

type UserRoleGlobalCache = {
  memory: Map<string, {
    expiresAt: number
    value: WorkspaceRole
  }>
  inflight: Map<string, Promise<WorkspaceRole>>
}

const userRoleGlobalCache = getUserRoleGlobalCache()

function getUserRoleGlobalCache(): UserRoleGlobalCache {
  const globalForCache = globalThis as typeof globalThis & {
    __lucidUserRoleCache?: UserRoleGlobalCache
  }
  if (!globalForCache.__lucidUserRoleCache) {
    globalForCache.__lucidUserRoleCache = {
      memory: new Map(),
      inflight: new Map(),
    }
  }
  return globalForCache.__lucidUserRoleCache
}

function shouldLogAccessTimings(): boolean {
  return process.env.ACCESS_TIMING_LOGS === 'true' || process.env.NODE_ENV === 'development'
}

function logAccessTiming(payload: Record<string, unknown>) {
  if (!shouldLogAccessTimings()) return
  console.log('[access:role]', redactLogMetadata(payload))
}

let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
    )
  }
  return _supabase
}

/**
 * Get user's plan for an organization (Server-side)
 */
export const getWorkspacePlan = cache(async (orgId: string): Promise<WorkspacePlan> => {
  const { data } = await getSupabase()
    .from('organizations')
    .select('plan_name')
    .eq('id', orgId)
    .single()

  return normalizeWorkspacePlanName(data?.plan_name as string | null | undefined)
})

/**
 * Get resolved plan limits for an organization (DB-first, static fallback)
 */
export const getResolvedPlanLimits = cache(async (orgId: string): Promise<PlanLimits> => {
  const { data: sub } = await getSupabase()
    .from('subscriptions')
    .select('plan:plans(name, features, limits), features, limits')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .single()

  // Supabase join returns plan as object or array; normalize
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planRaw = sub?.plan as any
  const planData = Array.isArray(planRaw) ? planRaw[0] : planRaw
  const planName = normalizeWorkspacePlanName(planData?.name as string | null | undefined)
  const dbFeatures = (sub?.features ?? planData?.features ?? undefined) as Record<string, boolean> | undefined
  const dbLimits = (sub?.limits ?? planData?.limits ?? undefined) as Record<string, number> | undefined

  return resolvePlanLimits(planName, dbFeatures, dbLimits)
})

/**
 * Get user's role in an organization (Server-side)
 */
export const getUserRole = cache(async (userId: string, orgId: string): Promise<WorkspaceRole> => {
  const startedAt = Date.now()
  const cacheKey = `${userId}:${orgId}`
  const cached = userRoleGlobalCache.memory.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    logAccessTiming({
      orgId,
      source: 'memory',
      cacheHit: true,
      total_ms: Date.now() - startedAt,
    })
    return cached.value
  }

  const distributedCacheStartedAt = Date.now()
  const distributedCached = await cacheStore.get(`org-role:${cacheKey}`)
  const distributedCacheReadyAt = Date.now()
  if (isWorkspaceRole(distributedCached)) {
    userRoleGlobalCache.memory.set(cacheKey, {
      expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
      value: distributedCached,
    })
    logAccessTiming({
      orgId,
      source: 'distributed',
      cacheHit: true,
      distributed_cache_ms: distributedCacheReadyAt - distributedCacheStartedAt,
      total_ms: Date.now() - startedAt,
    })
    return distributedCached
  }

  const existing = userRoleGlobalCache.inflight.get(cacheKey)
  if (existing) return existing

  const inflight = (async () => {
    const dbStartedAt = Date.now()
    const { data } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .single()
    const dbReadyAt = Date.now()

    const role = data?.role as string | undefined
    // If the DB contains an unrecognised role, fall back to 'guest' to avoid crashes
    const resolvedRole = !role || !VALID_ROLES.has(role) ? 'guest' : role as WorkspaceRole
    logAccessTiming({
      orgId,
      source: 'database',
      cacheHit: false,
      distributed_cache_ms: distributedCacheReadyAt - distributedCacheStartedAt,
      db_ms: dbReadyAt - dbStartedAt,
      total_ms: Date.now() - startedAt,
    })
    return resolvedRole
  })()

  userRoleGlobalCache.inflight.set(cacheKey, inflight)
  try {
    const value = await inflight
    userRoleGlobalCache.memory.set(cacheKey, {
      expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
      value,
    })
    await cacheStore.set(`org-role:${cacheKey}`, value, Math.ceil(ROLE_CACHE_TTL_MS / 1000))
    return value
  } finally {
    userRoleGlobalCache.inflight.delete(cacheKey)
  }
})

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === 'string' && VALID_ROLES.has(value)
}

/**
 * Check if user can perform an action (Server-side)
 */
export async function canPerformAction(
  userId: string,
  orgId: string,
  permission: keyof RolePermissions
): Promise<boolean> {
  const role = await getUserRole(userId, orgId)
  const perms = ROLE_PERMISSIONS[role]
  // Defensive: if the role somehow isn't in ROLE_PERMISSIONS, deny access
  if (!perms) return false
  return perms[permission]
}

/**
 * Check if usage is within limits (Server-side)
 */
export async function checkLimit(
  orgId: string,
  limit: keyof PlanLimits,
  currentUsage: number
): Promise<{ allowed: boolean; limit: number | typeof Infinity }> {
  const limits = await getResolvedPlanLimits(orgId)
  const limitValue = limits[limit]

  // Handle different limit types
  if (typeof limitValue === 'boolean') {
    return { allowed: limitValue, limit: limitValue ? Infinity : 0 }
  }

  return {
    allowed: limitValue === Infinity || currentUsage < limitValue,
    limit: limitValue
  }
}
