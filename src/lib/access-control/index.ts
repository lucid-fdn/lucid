/**
 * Comprehensive Access Control System
 * Industry-standard pattern for workspace plans + role-based permissions
 * 
 * Inspired by: Linear, Notion, GitHub, Vercel
 * 
 * Features:
 * - Plan-based feature gating (Free, Pro, Enterprise)
 * - Role-based permissions (owner, admin, developer, analyst, viewer, billing)
 * - Performance: Cached, optimized queries
 * - Scalable: Easy to add new features/roles
 * - Type-safe: Full TypeScript support
 */

import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { normalizeWorkspacePlanName } from './types'
import type { WorkspacePlan, WorkspaceRole, PlanLimits, RolePermissions } from './types'
import { PLAN_DEFAULTS, PLAN_LIMITS, resolvePlanLimits, ROLE_PERMISSIONS } from './types'

let _supabase: ReturnType<typeof createClient<any>> | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )
  }
  return _supabase
}

// Re-export types for convenience
export type { WorkspacePlan, WorkspaceRole, PlanLimits, RolePermissions }
export { PLAN_DEFAULTS, PLAN_LIMITS, resolvePlanLimits, ROLE_PERMISSIONS }

// ============================================================================
// SERVER-SIDE UTILITIES (Cached)
// ============================================================================

/**
 * Get workspace plan and usage
 * Cached per request for performance
 */
export const getWorkspacePlan = cache(async (workspaceId: string) => {
  const { data, error } = await getSupabase()
    .from('subscriptions')
    .select(`
      plan:plans(name, features, limits),
      features,
      limits
    `)
    .eq('org_id', workspaceId)
    .eq('status', 'active')
    .single()

  if (error || !data) {
    return { plan: 'starter' as WorkspacePlan, limits: PLAN_DEFAULTS.starter }
  }

  const planData = data.plan as unknown as { name?: string; features?: Record<string, boolean>; limits?: Record<string, number> }
  const planName = normalizeWorkspacePlanName(planData?.name as string | null | undefined)

  // DB subscription overrides plan defaults; plan-level DB data fills gaps
  const dbFeatures = (data.features ?? planData?.features ?? undefined) as Record<string, boolean> | undefined
  const dbLimits = (data.limits ?? planData?.limits ?? undefined) as Record<string, number> | undefined

  return {
    plan: planName,
    limits: resolvePlanLimits(planName, dbFeatures, dbLimits)
  }
})

/**
 * Get user's role in workspace
 * Cached per request
 */
export const getUserRole = cache(async (userId: string, workspaceId: string) => {
  const { data, error } = await getSupabase()
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', workspaceId)
    .single()
  
  if (error || !data) {
    return null
  }
  
  return data.role as WorkspaceRole
})

/**
 * Check if user has permission
 */
export async function hasPermission(
  userId: string,
  workspaceId: string,
  permission: keyof RolePermissions
): Promise<boolean> {
  const role = await getUserRole(userId, workspaceId)
  if (!role) return false
  
  const permissions = ROLE_PERMISSIONS[role]
  return permissions[permission]
}

/**
 * Check if workspace has feature
 */
export async function hasFeature(
  workspaceId: string,
  feature: keyof PlanLimits
): Promise<boolean> {
  const { limits } = await getWorkspacePlan(workspaceId)
  const value = limits[feature]
  
  // For boolean features
  if (typeof value === 'boolean') {
    return value
  }
  
  // For numeric limits (always has it, just might be limited)
  return true
}

/**
 * Check if workspace is within limits
 */
export async function checkLimit(
  workspaceId: string,
  limitType: keyof PlanLimits,
  currentUsage: number
): Promise<{ allowed: boolean; limit: number; usage: number }> {
  const { limits } = await getWorkspacePlan(workspaceId)
  const limit = limits[limitType] as number
  
  return {
    allowed: currentUsage < limit,
    limit,
    usage: currentUsage
  }
}

/**
 * Get workspace usage stats
 * Cached per request
 */
export const getWorkspaceUsage = cache(async (workspaceId: string) => {
  const [
    { count: memberCount },
    { count: projectCount },
    { count: environmentCount },
    docStorageResult,
    ragStorageResult,
  ] = await Promise.all([
    getSupabase()
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', workspaceId),
    getSupabase()
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', workspaceId)
      .is('deleted_at', null),
    getSupabase()
      .from('environments')
      .select('*, projects!inner(org_id)', { count: 'exact', head: true })
      .eq('projects.org_id', workspaceId)
      .is('deleted_at', null),
    getSupabase()
      .from('documents')
      .select('file_size')
      .eq('org_id', workspaceId),
    getSupabase()
      .from('rag_documents')
      .select('file_size_bytes')
      .eq('org_id', workspaceId),
  ])

  const docBytes = (docStorageResult.data || []).reduce(
    (sum: number, row: { file_size: number }) => sum + (row.file_size || 0), 0
  )
  const ragBytes = (ragStorageResult.data || []).reduce(
    (sum: number, row: { file_size_bytes: number }) => sum + (row.file_size_bytes || 0), 0
  )
  const totalGB = (docBytes + ragBytes) / (1024 * 1024 * 1024)

  return {
    members: memberCount || 0,
    projects: projectCount || 0,
    environments: environmentCount || 0,
    storageGB: Math.round(totalGB * 100) / 100,
  }
})

// ============================================================================
// COMBINED CHECKS
// ============================================================================

/**
 * Check if user can perform action (role + plan)
 */
export async function canPerformAction(
  userId: string,
  workspaceId: string,
  permission: keyof RolePermissions,
  feature?: keyof PlanLimits
): Promise<{ allowed: boolean; reason?: string }> {
  // Check role permission
  const hasRolePermission = await hasPermission(userId, workspaceId, permission)
  if (!hasRolePermission) {
    return { allowed: false, reason: 'Insufficient permissions' }
  }
  
  // Check plan feature (if specified)
  if (feature) {
    const hasRequiredFeature = await hasFeature(workspaceId, feature)
    if (!hasRequiredFeature) {
      const { plan } = await getWorkspacePlan(workspaceId)
      return { allowed: false, reason: `This feature requires a higher plan (current: ${plan})` }
    }
  }
  
  return { allowed: true }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get recommended plan for feature
 */
export function getRequiredPlan(feature: keyof PlanLimits): WorkspacePlan {
  if (PLAN_DEFAULTS.starter[feature]) return 'starter'
  if (PLAN_DEFAULTS.pro[feature]) return 'pro'
  return 'business'
}
