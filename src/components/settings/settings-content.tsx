"use client"

import * as React from "react"
import { lazy, Suspense } from "react"
import { SettingsProvider } from "@/contexts/settings-context"

// Lazy load settings components for better performance
const ProfileSettings = lazy(() => import("@/components/settings/profile-settings").then(m => ({ default: m.ProfileSettings })))
const AccountSettings = lazy(() => import("@/components/settings/account-settings").then(m => ({ default: m.AccountSettings })))
const NotificationsSettings = lazy(() => import("@/components/settings/notifications-settings").then(m => ({ default: m.NotificationsSettings })))
const OAuthConnections = lazy(() => import("@/components/settings/oauth-connections").then(m => ({ default: m.OAuthConnections })))
const OrganizationsSettings = lazy(() => import("@/components/settings/organizations-settings").then(m => ({ default: m.OrganizationsSettings })))
const TeamSettings = lazy(() => import("@/components/settings/team-settings").then(m => ({ default: m.TeamSettings })))
const WorkspaceSettings = lazy(() => import("@/components/settings/workspace-settings").then(m => ({ default: m.WorkspaceSettings })))
const BillingSettings = lazy(() => import("@/components/settings/billing-settings").then(m => ({ default: m.BillingSettings })))
const SecuritySettings = lazy(() => import("@/components/settings/security-settings").then(m => ({ default: m.SecuritySettings })))
const GatewayKeysSettings = lazy(() => import("@/components/settings/gateway-keys-settings").then(m => ({ default: m.GatewayKeysSettings })))
const AppearanceSettings = lazy(() => import("@/components/settings/appearance-settings").then(m => ({ default: m.AppearanceSettings })))

// Loading skeleton
function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-4 w-96 bg-muted rounded" />
      </div>
      <div className="space-y-4">
        <div className="h-20 w-full bg-muted rounded" />
        <div className="h-20 w-full bg-muted rounded" />
        <div className="h-20 w-full bg-muted rounded" />
      </div>
    </div>
  )
}

interface SettingsContentProps {
  currentTab: string
  userWorkspaces?: Array<{
    id: string
    slug: string
    name: string
    type: string
    role: string
    logo_url?: string
    member_count?: number
    plan_name?: string
  }>
}

/**
 * SettingsContent - Renders the appropriate settings content based on tab
 * 
 * Features:
 * - Dynamic imports for code splitting
 * - Loading states
 * - Fallback for unimplemented sections
 * 
 * @example
 * <SettingsContent currentTab="profile" userWorkspaces={workspaces} />
 */
export function SettingsContent({ currentTab, userWorkspaces = [] }: SettingsContentProps) {
  // Prefetch components on mount for instant feel
  React.useEffect(() => {
    // Prefetch all components after initial render
    const prefetchTimeout = setTimeout(() => {
      import("@/components/settings/profile-settings")
      import("@/components/settings/account-settings")
      import("@/components/settings/notifications-settings")
      import("@/components/settings/organizations-settings")
      import("@/components/settings/team-settings")
      import("@/components/settings/billing-settings")
      import("@/components/settings/security-settings")
      import("@/components/settings/appearance-settings")
    }, 100)

    return () => clearTimeout(prefetchTimeout)
  }, [])

  return (
    <SettingsProvider enabled={true}>
      <Suspense fallback={<SettingsLoadingSkeleton />}>
        {currentTab === 'profile' && <ProfileSettings />}
        {currentTab === 'account' && <AccountSettings />}
        {currentTab === 'notifications' && <NotificationsSettings />}
        {currentTab === 'credentials' && <OAuthConnections />}
        {currentTab === 'workspaces' && <OrganizationsSettings userWorkspaces={userWorkspaces} />}
        {currentTab === 'workspace' && <WorkspaceSettings userWorkspaces={userWorkspaces} />}
        {currentTab === 'team' && <TeamSettings />}
        {currentTab === 'billing' && <BillingSettings />}
        {currentTab === 'security' && <SecuritySettings />}
        {currentTab === 'gateway' && <GatewayKeysSettings />}
        {currentTab === 'appearance' && <AppearanceSettings />}
        {!['profile', 'account', 'notifications', 'credentials', 'workspaces', 'workspace', 'team', 'billing', 'security', 'gateway', 'appearance'].includes(currentTab) && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Settings</h2>
            <p className="text-muted-foreground">Select a section from the sidebar.</p>
          </div>
        )}
      </Suspense>
    </SettingsProvider>
  )
}
