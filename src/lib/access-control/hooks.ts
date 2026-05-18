/**
 * Client-Side Access Control Hooks
 * React hooks for checking permissions and plan features
 * 
 * Performance: Uses workspace context to avoid prop drilling
 */

'use client'

import { useWorkspace } from '@/contexts/workspace-context'
import type { WorkspacePlan, WorkspaceRole, PlanLimits, RolePermissions } from './types'
import { PLAN_DEFAULTS, ROLE_PERMISSIONS, normalizeWorkspacePlanName, resolvePlanLimits } from './types'

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get current workspace plan and limits
 * 
 * @example
 * const { plan, limits, isLoading } = useWorkspacePlan()
 * if (limits.advancedAnalytics) {
 *   return <AdvancedAnalytics />
 * }
 */
export function useWorkspacePlan() {
  const { workspace, loading } = useWorkspace()
  
  if (loading || !workspace) {
    return {
      plan: 'starter' as WorkspacePlan,
      limits: PLAN_DEFAULTS.starter,
      isLoading: loading
    }
  }
  
  // Get plan from workspace context
  const planName = normalizeWorkspacePlanName(workspace.subscription?.plan_name)
  const resolvedLimits = resolvePlanLimits(
    planName,
    workspace.subscription?.features,
    workspace.subscription?.limits,
  )

  return {
    plan: planName,
    limits: resolvedLimits || PLAN_DEFAULTS[planName] || PLAN_DEFAULTS.starter,
    isLoading: false
  }
}

/**
 * Get current user's role in workspace
 * 
 * @example
 * const { role, isOwner, isAdmin, isLoading } = useWorkspaceRole()
 * if (isOwner) {
 *   return <OwnerControls />
 * }
 */
export function useWorkspaceRole() {
  const { workspace, loading } = useWorkspace()
  
  if (loading || !workspace) {
    return {
      role: null,
      permissions: null,
      isOwner: false,
      isMember: false,
      isGuest: false,
      isLoading: loading
    }
  }
  
  const role = (workspace as unknown as { role?: WorkspaceRole }).role ?? null
  const permissions = role ? ROLE_PERMISSIONS[role] : null
  
  return {
    role,
    permissions,
    isOwner: role === 'owner',
    isMember: role === 'member',
    isGuest: role === 'guest',
    isLoading: false
  }
}

/**
 * Get current user's role in workspace
 * 
 * @example
 * const { role, isOwner, isMember, isGuest } = useWorkspaceRole()
 * if (isOwner) {
 *   return <OwnerControls />
 * }
 * if (isMember) {
 *   return <MemberControls />
 * }
 */
export function usePermission(permission: keyof RolePermissions): boolean {
  const { permissions } = useWorkspaceRole()
  if (!permissions) return false
  return permissions[permission]
}

/**
 * Check if workspace has feature (plan-based)
 * 
 * @example
 * const hasAnalytics = useFeature('advancedAnalytics')
 * if (!hasAnalytics) {
 *   return <UpgradePrompt feature="advancedAnalytics" />
 * }
 */
export function useFeature(feature?: keyof PlanLimits): boolean {
  const { limits } = useWorkspacePlan()
  if (!feature) return true
  const value = limits[feature]

  if (typeof value === 'boolean') {
    return value
  }

  return true
}

/**
 * Check if workspace is within limit
 * 
 * @example
 * const { allowed, limit, usage } = useLimit('maxMembers', currentMemberCount)
 * if (!allowed) {
 *   return <UpgradePrompt limit="maxMembers" current={usage} max={limit} />
 * }
 */
export function useLimit(
  limitType: keyof PlanLimits,
  currentUsage: number
): { allowed: boolean; limit: number; usage: number } {
  const { limits } = useWorkspacePlan()
  const limit = limits[limitType] as number
  
  return {
    allowed: currentUsage < limit,
    limit,
    usage: currentUsage
  }
}

/**
 * Check if user can perform action (combines role + plan)
 * 
 * @example
 * const { allowed, reason } = useCanPerformAction('inviteMembers', 'guestAccess')
 * if (!allowed) {
 *   return <BlockedMessage reason={reason} />
 * }
 */
export function useCanPerformAction(
  permission: keyof RolePermissions,
  feature?: keyof PlanLimits
): { allowed: boolean; reason?: string } {
  const { permissions } = useWorkspaceRole()
  const { plan } = useWorkspacePlan()
  
  // Always call hooks unconditionally (Rules of Hooks)
  const hasRequiredFeature = useFeature(feature)

  // Check role permission
  if (!permissions || !permissions[permission]) {
    return { allowed: false, reason: 'Insufficient permissions' }
  }

  // Check plan feature (if specified)
  if (feature && !hasRequiredFeature) {
    return { allowed: false, reason: `This feature requires a higher plan (current: ${plan})` }
  }

  return { allowed: true }
}

// ============================================================================
// CONVENIENCE HOOKS
// ============================================================================

/**
 * Check multiple permissions at once
 * 
 * @example
 * const { canInvite, canRemove, canEdit } = usePermissions({
 *   canInvite: 'inviteMembers',
 *   canRemove: 'removeMembers',
 *   canEdit: 'editProjects'
 * })
 */
export function usePermissions<T extends Record<string, keyof RolePermissions>>(
  permissionMap: T
): Record<keyof T, boolean> {
  const { permissions } = useWorkspaceRole()
  
  const result = {} as Record<keyof T, boolean>
  
  for (const [key, permission] of Object.entries(permissionMap)) {
    result[key as keyof T] = permissions ? permissions[permission] : false
  }
  
  return result
}

/**
 * Check multiple features at once
 * 
 * @example
 * const { hasAnalytics, hasAPI, hasWebhooks } = useFeatures({
 *   hasAnalytics: 'advancedAnalytics',
 *   hasAPI: 'apiAccess',
 *   hasWebhooks: 'webhooks'
 * })
 */
export function useFeatures<T extends Record<string, keyof PlanLimits>>(
  featureMap: T
): Record<keyof T, boolean> {
  const { limits } = useWorkspacePlan()
  
  const result = {} as Record<keyof T, boolean>
  
  for (const [key, feature] of Object.entries(featureMap)) {
    const value = limits[feature]
    result[key as keyof T] = typeof value === 'boolean' ? value : true
  }
  
  return result
}

/**
 * Get required plan for a feature
 * 
 * @example
 * const requiredPlan = useRequiredPlan('advancedAnalytics')
 * // Returns 'pro'
 */
export function useRequiredPlan(feature: keyof PlanLimits): WorkspacePlan {
  if (PLAN_DEFAULTS.starter[feature]) return 'starter'
  if (PLAN_DEFAULTS.pro[feature]) return 'pro'
  return 'business'
}
