/**
 * Centralized Feature Gating Component
 * Notion-style upgrade prompts with badges and tooltips
 * 
 * Usage:
 * <FeatureGate permission="inviteMembers" feature="guestAccess">
 *   <InviteButton />
 * </FeatureGate>
 */

'use client'

import * as React from "react"
import { useWorkspaceRole, useWorkspacePlan, useCanPerformAction } from "@/lib/access-control/hooks"
import type { RolePermissions, PlanLimits } from "@/lib/access-control"
import { UpgradeBadge } from "./upgrade-badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/primitives/radix/tooltip'

interface FeatureGateProps {
  /** Role permission required (optional) */
  permission?: keyof RolePermissions
  
  /** Plan feature required (optional) */
  feature?: keyof PlanLimits
  
  /** What to render when locked */
  fallback?: 'hide' | 'disable' | 'badge'
  
  /** Custom message for tooltip */
  message?: string
  
  /** Children to render when allowed */
  children: React.ReactNode
  
  /** Custom styling */
  className?: string
}

/**
 * FeatureGate - Centralized access control wrapper
 * 
 * Automatically handles:
 * - Role-based permissions
 * - Plan-based features
 * - Upgrade prompts
 * - Tooltips
 * - Disabled states
 * 
 * @example
 * // Hide if no permission
 * <FeatureGate permission="inviteMembers" fallback="hide">
 *   <InviteButton />
 * </FeatureGate>
 * 
 * @example
 * // Disable with upgrade badge
 * <FeatureGate feature="advancedAnalytics" fallback="badge">
 *   <AnalyticsButton />
 * </FeatureGate>
 * 
 * @example
 * // Both checks
 * <FeatureGate permission="inviteMembers" feature="guestAccess">
 *   <InviteGuestButton />
 * </FeatureGate>
 */
export function FeatureGate({
  permission,
  feature,
  fallback = 'hide',
  message,
  children,
  className
}: FeatureGateProps) {
  const { allowed, reason } = useCanPerformAction(
    permission || 'viewSettings', // Default to minimal permission
    feature
  )
  
  const { plan } = useWorkspacePlan()
  const { role: _role } = useWorkspaceRole()
  
  // If allowed, render children normally
  if (allowed) {
    return <>{children}</>
  }
  
  // Not allowed - handle based on fallback strategy
  
  // Strategy 1: Hide completely (default)
  if (fallback === 'hide') {
    return null
  }
  
  // Strategy 2: Show but disabled (for awareness)
  if (fallback === 'disable') {
    const tooltipMessage = message || reason || 'This feature is not available'
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={className} style={{ opacity: 0.5, pointerEvents: 'none' }}>
              {children}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipMessage}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  
  // Strategy 3: Notion-style badge (most engaging)
  if (fallback === 'badge') {
    const tooltipMessage = message || reason || 'Upgrade to unlock this feature'
    const requiredPlan = getRequiredPlan(feature)
    
    return (
      <div className={className} style={{ position: 'relative', display: 'inline-block' }}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div style={{ opacity: 0.6, pointerEvents: 'none' }}>
                {children}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{tooltipMessage}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Current plan: {plan} • Required: {requiredPlan}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {/* Notion-style badge */}
        <UpgradeBadge 
          requiredPlan={requiredPlan}
          currentPlan={plan}
        />
      </div>
    )
  }
  
  return null
}

// Helper to determine required plan
function getRequiredPlan(feature?: keyof PlanLimits): 'pro' | 'business' {
  if (!feature) return 'pro'

  // Features that need Business
  const businessFeatures: Array<keyof PlanLimits> = [
    'ssoEnabled'
  ]

  if (businessFeatures.includes(feature)) {
    return 'business'
  }
  
  return 'pro'
}
