"use client"

import React from "react"
import { SidebarProvider, SidebarInset } from "@/ui/components/sidebar"
import { UnifiedNavbar } from "@/components/navigation"
import { WorkspaceSidebar } from "@/components/navigation/workspace-sidebar"
import { DetailSidebar } from "@/components/navigation/detail-sidebar"
import { DetailSidebarProvider, useDetailSidebarOptional } from "@/contexts/detail-sidebar-context"
import dynamic from "next/dynamic"

const SettingsModal = dynamic(() => import("@/components/settings/settings-modal").then(mod => ({ default: mod.SettingsModal })), { ssr: false })
const SettingsContent = dynamic(() => import("@/components/settings/settings-content").then(mod => ({ default: mod.SettingsContent })), { ssr: false })
import { useSidebarDefault } from "@/contexts/sidebar-context"
import { usePathname } from "next/navigation"

interface StudioClientLayoutProps {
  children: React.ReactNode
  userWorkspaces: Array<{
    id: string
    slug: string
    name: string
    type: string
    role: string
    logo_url?: string
    member_count?: number
    plan_name?: string
  }>
  currentWorkspaceSlug: string | null
}

export function AppClientLayout({
  children,
  userWorkspaces,
  currentWorkspaceSlug: initialSlug,
}: StudioClientLayoutProps) {
  const [showSettings, setShowSettings] = React.useState(false)
  const [currentTab, setCurrentTab] = React.useState('profile')
  const { defaultOpen } = useSidebarDefault()

  const handleSettingsClick = React.useCallback((tab?: string) => {
    const targetTab = tab || 'profile'
    setCurrentTab(targetTab)
    setShowSettings(true)
  }, [])

  const handleModalClose = React.useCallback((open: boolean) => {
    setShowSettings(open)
    if (!open) {
      setCurrentTab('profile')
    }
  }, [])

  // Get slug from pathname for client-side navigation
  const pathname = usePathname()
  const rawSlug = pathname?.split('/')[1] || initialSlug
  const isNewProjectRoute = React.useMemo(() => {
    if (!pathname) return false
    const segments = pathname.split('/').filter(Boolean)
    return segments.length === 2 && segments[1] === 'new'
  }, [pathname])

  // Validate that the slug is actually a workspace slug
  const clientSlug = React.useMemo(() => {
    if (!rawSlug) return null
    const isValid = userWorkspaces.find(w => w.slug === rawSlug)
    return isValid ? rawSlug : null
  }, [rawSlug, userWorkspaces])

  // Determine if sidebar should be collapsed (not hidden, just collapsed)
  const _isInWorkspace = React.useMemo(() => {
    return Boolean(clientSlug)
  }, [clientSlug])

  // Get current workspace data for settings modal
  const currentWorkspace = React.useMemo(() => {
    if (!clientSlug) return null
    return userWorkspaces.find(w => w.slug === clientSlug)
  }, [clientSlug, userWorkspaces])
  const contentShellClass = isNewProjectRoute
    ? "flex h-full w-full flex-col overflow-hidden"
    : "flex h-full w-full flex-col pt-14 overflow-hidden"

  return (
    <DetailSidebarProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <UnifiedNavbar
          variant="studio"
          onSettingsClick={handleSettingsClick}
          workspaceSlug={clientSlug}
          userWorkspaces={userWorkspaces}
        />
        {/* Sidebar switches context: detail page → DetailSidebar, otherwise → WorkspaceSidebar */}
        {!isNewProjectRoute ? (
          <SidebarSwitch
            onSettingsClick={handleSettingsClick}
            userWorkspaces={userWorkspaces}
            currentWorkspaceSlug={clientSlug}
          />
        ) : null}
        <SidebarInset className="overflow-x-hidden">
          <div className={contentShellClass}>
            <div className="flex flex-1 flex-col gap-4 w-full max-w-full overflow-x-hidden min-h-0">
              {children}
            </div>
          </div>
        </SidebarInset>

        <SettingsModal
          open={showSettings}
          onOpenChange={handleModalClose}
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          workspaceName={currentWorkspace?.name}
          userRole={currentWorkspace?.role}
        >
          <SettingsContent
            currentTab={currentTab}
            userWorkspaces={userWorkspaces}
          />
        </SettingsModal>
      </SidebarProvider>
    </DetailSidebarProvider>
  )
}

/**
 * Renders DetailSidebar when any detail page has registered, WorkspaceSidebar otherwise.
 * This is the generic switch — any detail page (agent, workflow, etc.) that calls
 * useDetailSidebar().register() will trigger the DetailSidebar.
 */
const SIDEBAR_CLS = "mt-14 h-[calc(100vh-3.5rem)]"

function SidebarSwitch({
  onSettingsClick,
  userWorkspaces,
  currentWorkspaceSlug,
}: {
  onSettingsClick: (tab?: string) => void
  userWorkspaces: StudioClientLayoutProps['userWorkspaces']
  currentWorkspaceSlug: string | null
}) {
  const detailCtx = useDetailSidebarOptional()
  const isDetail = detailCtx?.isDetailPage ?? false

  if (isDetail) {
    return <DetailSidebar className={SIDEBAR_CLS} />
  }

  return (
    <WorkspaceSidebar
      className={SIDEBAR_CLS}
      onSettingsClick={onSettingsClick}
      userWorkspaces={userWorkspaces}
      currentWorkspaceSlug={currentWorkspaceSlug}
    />
  )
}
