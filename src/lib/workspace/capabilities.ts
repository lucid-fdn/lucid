/**
 * Workspace Capabilities Resolver (Server-Side)
 *
 * Capability-driven UX model: UI adapts based on what user can do RIGHT NOW
 * based on plan, role, org context, and service enablement.
 *
 * Uses the centralized access-control definitions from @/lib/access-control/types
 * so client + server stay in sync with a single source of truth.
 */

import 'server-only'
import { cache } from 'react'
import { getOrgSubscription, getUserOrganizations } from '@/lib/db'
import {
  resolvePlanLimits,
  ROLE_PERMISSIONS,
  normalizeWorkspacePlanName,
  type WorkspacePlan,
  type WorkspaceRole,
  type PlanLimits,
  type RolePermissions,
  type RuntimeFeatureAccess,
  getRuntimeFeatureAccessFromLimits,
} from '@/lib/access-control/types'

export type FeatureState =
  | 'hidden'           // Not relevant to this user/plan
  | 'discoverable'     // Teaser / upgrade path shown
  | 'setup-required'   // Guided onboarding needed
  | 'active'           // Full UX available
  | 'attention'        // Errors/issues need action

export interface WorkspaceCapabilities {
  // Identifiers
  planName: WorkspacePlan
  role: WorkspaceRole | null

  // Role booleans (convenience)
  isOwner: boolean
  isAdmin: boolean
  isMember: boolean

  // Plan + role combined
  permissions: RolePermissions
  limits: PlanLimits
  requiresPlanUpgrade: boolean

  // Gateway Keys — computed from centralized definitions
  canViewGatewayKeys: boolean
  canManageGatewayKeys: boolean
  gatewayKeysState: FeatureState
  isGatewayEnabled: boolean
  hasActiveGatewayKey: boolean

  // Video Studio
  videoStudioState: FeatureState

  // Content Studio
  contentStudioState: FeatureState

  // Audit
  canViewAudit: boolean

  // Runtime & Engine
  runtimeFeatureAccess: RuntimeFeatureAccess
}

/**
 * Get workspace capabilities for a user in an organization.
 * Uses React cache() for request deduplication.
 *
 * DB subscription is the source of truth for plan features/limits.
 * Static PLAN_DEFAULTS are only used as fallback when DB data is missing.
 */
export const getWorkspaceCapabilities = cache(async (
  userId: string,
  orgId: string
): Promise<WorkspaceCapabilities> => {
  // Fetch org membership and subscription in parallel
  const [memberships, subscription] = await Promise.all([
    getUserOrganizations(userId),
    getOrgSubscription(orgId),
  ])

  // Find user's role in this org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = memberships.find((m: any) => {
    const org = Array.isArray(m.organization) ? m.organization[0] : m.organization
    return org?.id === orgId
  })
  const role = (membership?.role || null) as WorkspaceRole | null
  const isMember = !!membership

  // Role booleans
  const isOwner = role === 'owner'
  const isAdmin = role === 'admin' || isOwner

  // Plan info — DB subscription is source of truth, static defaults as fallback
  const planName = normalizeWorkspacePlanName(subscription?.plan_name as string | null | undefined)
  const limits = resolvePlanLimits(planName, subscription?.features, subscription?.limits)
  const permissions = role ? ROLE_PERMISSIONS[role] : ROLE_PERMISSIONS.guest

  // Gateway — derived from centralized plan limits + role
  const canViewGatewayKeys = isMember && limits.gatewayKeysEnabled
  const canManageGatewayKeys = isAdmin && limits.gatewayKeyCustomLimits
  const isGatewayEnabled = limits.gatewayKeysEnabled

  // Determine gateway keys feature state
  let gatewayKeysState: FeatureState = 'hidden'
  if (!isMember) {
    gatewayKeysState = 'hidden'
  } else if (!limits.gatewayKeyCustomLimits) {
    gatewayKeysState = 'discoverable' // Show upgrade path
  } else if (!isAdmin) {
    gatewayKeysState = 'hidden' // Non-admins don't see management UI
  } else {
    gatewayKeysState = 'active'
  }

  // Video Studio — internal team only (env-gated by org ID)
  const isInternalOrg = (await import('@/lib/auth/internal')).isInternalOrg(orgId)
  let videoStudioState: FeatureState = 'hidden'
  if (!isMember) {
    videoStudioState = 'hidden'
  } else if (!isInternalOrg) {
    videoStudioState = 'hidden' // Internal-only: not available to external users
  } else {
    videoStudioState = 'active'
  }

  // Content Studio — internal team only
  let contentStudioState: FeatureState = 'hidden'
  if (!isMember) {
    contentStudioState = 'hidden'
  } else if (!isInternalOrg) {
    contentStudioState = 'hidden'
  } else {
    contentStudioState = 'active'
  }

  // Audit visibility — admins on Pro+ can view
  const canViewAudit = isAdmin && limits.gatewayKeyAudit

  return {
    planName,
    role,
    isOwner,
    isAdmin,
    isMember,
    permissions,
    limits,
    requiresPlanUpgrade: !limits.gatewayKeyCustomLimits && isMember,
    canViewGatewayKeys,
    canManageGatewayKeys,
    gatewayKeysState,
    isGatewayEnabled,
    videoStudioState,
    contentStudioState,
    canViewAudit,
    runtimeFeatureAccess: getRuntimeFeatureAccessFromLimits(limits),
    hasActiveGatewayKey: false, // Set by the page when keys are loaded
  }
})

/**
 * Get the next action for a blocked capability
 */
export function getCapabilityNextAction(
  capabilities: WorkspaceCapabilities,
  feature: 'gatewayKeys' | 'audit' | 'videoStudio' | 'contentStudio'
): { action: string; label: string; href?: string } | null {
  if (feature === 'gatewayKeys') {
    if (!capabilities.isMember) {
      return { action: 'request-access', label: 'Request Access' }
    }
    if (capabilities.requiresPlanUpgrade) {
      return { action: 'upgrade', label: 'Upgrade to Pro', href: '/settings/billing' }
    }
    if (!capabilities.isAdmin) {
      return { action: 'contact-admin', label: 'Contact Admin' }
    }
    if (capabilities.gatewayKeysState === 'setup-required') {
      return { action: 'setup', label: 'Set Up Gateway' }
    }
  }

  if (feature === 'videoStudio') {
    if (capabilities.videoStudioState === 'hidden') {
      return null // Internal-only: no upgrade path
    }
  }

  if (feature === 'contentStudio') {
    if (capabilities.contentStudioState === 'hidden') {
      return null
    }
  }

  if (feature === 'audit') {
    if (!capabilities.canViewAudit) {
      if (capabilities.requiresPlanUpgrade) {
        return { action: 'upgrade', label: 'Upgrade to Pro', href: '/settings/billing' }
      }
      return { action: 'contact-admin', label: 'Contact Admin' }
    }
  }

  return null
}
