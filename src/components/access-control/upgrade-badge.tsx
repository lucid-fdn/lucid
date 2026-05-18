/**
 * Notion-Style Upgrade Badge
 * Shows on locked features, redirects to billing page on click
 */

'use client'

import * as React from "react"
import { useRouter } from "next/navigation"
import { Crown, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/contexts/workspace-context"

interface UpgradeBadgeProps {
  requiredPlan: 'pro' | 'business'
  currentPlan: string
  className?: string
}

/**
 * UpgradeBadge - Notion-style floating badge
 * 
 * Features:
 * - Floats on top-right of locked feature
 * - Shows required plan
 * - Clickable - redirects to billing page
 * - Animated gradient background
 * 
 * @example
 * <UpgradeBadge requiredPlan="pro" currentPlan="free" />
 */
export function UpgradeBadge({
  requiredPlan,
  currentPlan: _currentPlan,
  className
}: UpgradeBadgeProps) {
  const router = useRouter()
  const { workspace } = useWorkspace()
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    // Redirect to billing page with upgrade intent
    if (workspace?.org?.slug) {
      router.push(`/${workspace.org.slug}/settings/billing?upgrade=${requiredPlan}`)
    } else {
      // Fallback to general billing
      router.push(`/settings/billing?upgrade=${requiredPlan}`)
    }
  }
  
  const Icon = requiredPlan === 'business' ? Crown : Sparkles
  const label = requiredPlan === 'business' ? 'Dedicated' : 'Pro'
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "absolute -top-2 -right-2 z-10",
        "flex items-center gap-1",
        "px-2 py-0.5 rounded-full",
        "text-xs font-medium",
        "bg-gradient-to-r from-purple-500 to-pink-500",
        "text-white",
        "hover:from-purple-600 hover:to-pink-600",
        "transition-all duration-200",
        "shadow-lg hover:shadow-xl",
        "cursor-pointer",
        "animate-pulse hover:animate-none",
        className
      )}
      title={`Upgrade to ${requiredPlan} to unlock`}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </button>
  )
}

/**
 * Inline Upgrade Link - For text/menu items
 * Simpler inline version without absolute positioning
 */
export function UpgradeLink({ 
  requiredPlan, 
  className,
  children 
}: { 
  requiredPlan: 'pro' | 'business'
  className?: string
  children?: React.ReactNode
}) {
  const router = useRouter()
  const { workspace } = useWorkspace()
  
  const handleClick = () => {
    if (workspace?.org?.slug) {
      router.push(`/${workspace.org.slug}/settings/billing?upgrade=${requiredPlan}`)
    } else {
      router.push(`/settings/billing?upgrade=${requiredPlan}`)
    }
  }
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5",
        "text-xs font-medium",
        "text-purple-600 dark:text-purple-400",
        "hover:text-purple-700 dark:hover:text-purple-300",
        "transition-colors duration-120",
        className
      )}
    >
      {children || (
        <>
          <Sparkles className="h-3 w-3" />
          Upgrade to {requiredPlan}
        </>
      )}
    </button>
  )
}

/**
 * Upgrade Button - Standalone CTA button
 * Now wraps shadcn/ui Button for consistency
 */
export function UpgradeButton({
  requiredPlan,
  size = 'default',
  children
}: {
  requiredPlan: 'pro' | 'business'
  size?: 'sm' | 'default' | 'lg'
  children?: React.ReactNode
}) {
  const router = useRouter()
  const { workspace } = useWorkspace()
  
  const handleClick = () => {
    if (workspace?.org?.slug) {
      router.push(`/${workspace.org.slug}/settings/billing?upgrade=${requiredPlan}`)
    } else {
      router.push(`/settings/billing?upgrade=${requiredPlan}`)
    }
  }
  
  return (
    <Button
      onClick={handleClick}
      size={size}
      className={cn(
        "gap-2",
        "bg-gradient-to-r from-purple-600 to-pink-600",
        "hover:from-purple-700 hover:to-pink-700",
        "text-white",
        "shadow-md hover:shadow-lg"
      )}
    >
      <Crown className="h-4 w-4" />
      {children || `Upgrade to ${requiredPlan}`}
    </Button>
  )
}
