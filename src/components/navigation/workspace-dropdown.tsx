"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus, Users } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { LoadingRedirect } from "@/components/loading-redirect"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/animate-ui/primitives/radix/tooltip'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/ui/components/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/contexts/auth-context"
import { useProfile } from "@/contexts/profile-context"
import { useWorkspace } from "@/contexts/workspace-context"
import { useResolvedFeatureFlags } from "@/contexts/feature-flags-context"
import { InviteMembersModal } from "@/components/workspace/invite-members-modal"
import { useLimit } from "@/components/access-control"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { UpgradeCard } from "@/components/access-control"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

interface WorkspaceDropdownProps {
  onSettingsClick?: () => void
  /** All workspaces user has access to (from server) */
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
  /** Current workspace slug from URL */
  currentWorkspaceSlug?: string
  /** Whether sidebar is collapsed (icon mode) */
  collapsed?: boolean
}

export function WorkspaceDropdown({ 
  onSettingsClick,
  userWorkspaces = [],
  currentWorkspaceSlug,
  collapsed = false
}: WorkspaceDropdownProps) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { workspace } = useWorkspace()
  const { teamInDropdown: _teamInDropdown } = useResolvedFeatureFlags()
  const router = useRouter()
  const _pathname = usePathname()
  
  // Invite modal state
  const [showInviteModal, setShowInviteModal] = React.useState(false)
  
  // Upgrade card state
  const [showUpgradeCard, setShowUpgradeCard] = React.useState(false)
  
  // Extract current workspace from userWorkspaces BEFORE any conditionals
  const currentWorkspace = userWorkspaces.find(w => w.slug === currentWorkspaceSlug) || userWorkspaces[0]
  
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY (Rules of Hooks)
  const userRole = currentWorkspace?.role as 'owner' | 'admin' | 'member' | 'guest' | undefined
  const currentMemberCount = currentWorkspace?.member_count || 1
  const workspaceCount = userWorkspaces.length
  
  // Use YOUR centralized access control hooks
  const { allowed: canAddMembers, limit: memberLimit } = useLimit('maxMembers', currentMemberCount)
  const { allowed: canAddWorkspace, limit: workspaceLimit } = useLimit('maxWorkspaces', workspaceCount)
  
  // Access control - must be after hooks
  const canInvite = userRole === 'owner' || userRole === 'admin'

  // Prioritize server data (userWorkspaces) - instant display!
  // Only show skeleton if no server data AND no context data
  const hasServerData = userWorkspaces.length > 0 && currentWorkspace
  const hasContextData = workspace && user
  const hasData = hasServerData || hasContextData;
  
  if (!hasData) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <Avatar className="h-8 w-8 rounded-lg animate-pulse">
              <AvatarFallback className="rounded-lg bg-muted" />
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="h-4 w-24 bg-muted animate-pulse rounded" />
              <span className="h-3 w-16 bg-muted animate-pulse rounded mt-1" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Get user avatar for personal workspace fallback
  const userAvatar = profile?.avatar_url || user?.avatar_url
  
  if (!currentWorkspace) {
    // Fallback to context data
    if (!workspace) return null
    const org = workspace.org
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarFallback className="rounded-lg">
                {org.name?.[0]?.toUpperCase() || 'W'}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{org.name}</span>
              <span className="truncate text-xs">Free · 1 member</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }
  
  // Determine workspace logo (fallback to user avatar for personal workspaces)
  const workspaceLogo = currentWorkspace.type === 'personal' && !currentWorkspace.logo_url
    ? userAvatar
    : currentWorkspace.logo_url
  
  const plan = currentWorkspace.plan_name || 'Free'
  const memberCount = currentWorkspace.member_count || 1
  
  // Handle workspace switch
  const handleWorkspaceSwitch = (workspaceSlug: string) => {
    console.log('[workspace-dropdown] Switching to workspace:', workspaceSlug)
    router.push(`/${workspaceSlug}/dashboard`)
  }

  // Handle "Add workspace" click - use YOUR centralized system
  const handleAddWorkspace = () => {
    if (!canAddWorkspace) {
      // Show YOUR upgrade card
      setShowUpgradeCard(true)
    } else {
      // Allowed - navigate to create workspace form
      router.push('/onboarding/workspace/new')
    }
  }
  
  return (
    <>
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={collapsed}>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-hover/workspace-hover:opacity-0 transition-opacity duration-200"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {workspaceLogo && <AvatarImage src={workspaceLogo} alt={currentWorkspace.name} />}
                <AvatarFallback className="rounded-lg">
                  {currentWorkspace.name?.[0]?.toUpperCase() || 'W'}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{currentWorkspace.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {plan} · {memberCount} {memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            {/* Workspace list */}
            {userWorkspaces.length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">
                  Workspaces
                </DropdownMenuLabel>
                <TooltipProvider delayDuration={300}>
                  {userWorkspaces.map((ws) => {
                    // Determine workspace avatar (fallback to user for personal)
                    const wsAvatar = ws.type === 'personal' && !ws.logo_url
                      ? userAvatar
                      : ws.logo_url
                    
                    // Determine workspace info for tooltip
                    const wsType = ws.type === 'personal' ? 'Personal' : 'Organization'
                    const wsPlan = ws.plan_name || 'Free'
                    const wsMemberCount = ws.member_count || 1
                    
                    return (
                      <Tooltip key={ws.id}>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            onClick={() => handleWorkspaceSwitch(ws.slug)}
                            className="cursor-pointer"
                          >
                            <Avatar className="mr-2 h-5 w-5 rounded-sm">
                              {wsAvatar && <AvatarImage src={wsAvatar} alt={ws.name} />}
                              <AvatarFallback className="text-xs rounded-sm">
                                {ws.name?.[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 truncate">{ws.name}</div>
                            {ws.slug === currentWorkspaceSlug && (
                              <Check className="ml-2 h-4 w-4" />
                            )}
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent 
                          side="right" 
                          className="text-xs bg-popover border-border"
                        >
                          <div className="space-y-1.5">
                            <div className="font-semibold">{ws.name}</div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>{wsType}</span>
                              <span>•</span>
                              <span>{wsPlan}</span>
                            </div>
                            <div className="text-muted-foreground">
                              {wsMemberCount} {wsMemberCount === 1 ? 'member' : 'members'}
                            </div>
                            <div className="text-muted-foreground">
                              Role: <span className="capitalize">{ws.role}</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </TooltipProvider>
              </>
            )}
            
            <DropdownMenuItem onClick={handleAddWorkspace}>
              <Plus className="mr-2 h-4 w-4" />
              Add workspace
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            {currentWorkspace && (
              <DropdownMenuItem 
                onClick={() => canInvite ? setShowInviteModal(true) : null}
                disabled={!canInvite}
                className="flex items-center justify-between"
              >
                <div className="flex items-center">
                  <Users className="mr-2 h-4 w-4" />
                  Invite members
                </div>
                {canInvite && !canAddMembers && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {currentMemberCount}/{memberLimit}
                  </Badge>
                )}
                {!canInvite && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Owner only
                  </Badge>
                )}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
    
    {/* Invite Members Modal (z-60 for nested use) */}
    {currentWorkspace && (
      <InviteMembersModal
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        workspaceId={currentWorkspace.id}
        workspaceName={currentWorkspace.name}
        currentMemberCount={currentMemberCount}
        zIndex={60}
      />
    )}
    
    {/* Upgrade Card - Show when workspace limit reached (uses YOUR system) */}
    <Dialog open={showUpgradeCard} onOpenChange={setShowUpgradeCard}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Upgrade Required</DialogTitle>
        </VisuallyHidden>
        <UpgradeCard
          feature="Additional Workspaces"
          requiredPlan="pro"
          benefits={[
            `Create up to ${workspaceLimit === Infinity ? 'unlimited' : workspaceLimit} workspaces`,
            'Advanced team collaboration',
            'Priority email support',
            'Advanced analytics'
          ]}
          disabled={true}
          disabledMessage="Coming Soon"
        />
      </DialogContent>
    </Dialog>
    </>
  )
}
