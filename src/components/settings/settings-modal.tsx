"use client"

import * as React from "react"
import { User, Lock, Building2, Shield, Users, Zap, LayoutGrid, Key, Palette } from "lucide-react"
import { DialogWithSidebar, DialogSidebarItem } from "@/ui/components/dialog-with-sidebar"

// Dynamic items builder - allows context-aware titles and role-based badges
export function getSettingsItems(workspaceName?: string, userRole?: string): DialogSidebarItem[] {
  // Always show "Current Workspace" without displaying the actual name
  const workspaceSection = 'Current Workspace'
  
  // Determine if user can access workspace-level settings
  const isOwner = userRole === 'owner'
  const isAdmin = userRole === 'admin'
  const canManageWorkspace = isOwner || isAdmin
  
  const items: DialogSidebarItem[] = [
    { id: 'profile', title: 'Profile', icon: User, section: 'Personal Settings' },
    { id: 'account', title: 'Account', icon: Lock, section: 'Personal Settings' },
    // { id: 'notifications', title: 'Notifications', icon: Bell, section: 'Personal Settings' }, // Hidden — triggers Bitwarden extension crash
    { id: 'credentials', title: 'Integrations', icon: LayoutGrid, section: 'Personal Settings' },
    { id: 'appearance', title: 'Appearance', icon: Palette, section: 'Personal Settings' },
    { id: 'workspaces', title: 'Workspaces', icon: Building2, section: 'Personal Settings' },
  ]
  
  // Only show workspace settings for owners/admins
  if (canManageWorkspace) {
    items.push({ 
      id: 'workspace', 
      title: 'Profile', 
      icon: Building2, 
      section: workspaceSection,
      badge: 'Admin'  // Admin-level access (Owner & Admin can access)
    })
  }
  
  // Team tab - show badge based on role
  if (canManageWorkspace) {
    items.push({ 
      id: 'team', 
      title: 'Team', 
      icon: Users, 
      section: workspaceSection, 
      badge: 'Admin' // Always show Admin for team management
    })
  }
  
  // Gateway Keys - admin-only, Pro+ plans
  if (canManageWorkspace) {
    items.push({ 
      id: 'gateway', 
      title: 'Gateway Keys', 
      icon: Key, 
      section: workspaceSection, 
      badge: 'Admin'
    })
  }
  
  // Upgrade Plan - disabled (visible but not clickable)
  if (isOwner) {
    items.push({ 
      id: 'billing', 
      title: '💎 Upgrade Plan', 
      icon: Zap, 
      section: workspaceSection, 
      badge: 'Owner',
      disabled: true
    })
  }
  
  // Security - always visible
  items.push({ 
    id: 'security', 
    title: 'Privacy & Security', 
    icon: Shield, 
    section: 'Security' 
  })
  
  return items
}

// Legacy export for backward compatibility
export const settingsItems = getSettingsItems()

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTab: string
  onTabChange: (tab: string) => void
  children: React.ReactNode
  workspaceName?: string
  userRole?: string
}

/**
 * SettingsModal - Responsive settings modal with dynamic role-based access
 * 
 * Features:
 * - Desktop: Dialog with sidebar (shadcn pattern)
 * - Mobile: Drawer with tabs
 * - Responsive breakpoint at 768px
 * - Role-based tab visibility (Owner/Admin/Member)
 * - Dynamic workspace section naming
 * 
 * @example
 * <SettingsModal 
 *   open={open} 
 *   onOpenChange={setOpen}
 *   currentTab={tab}
 *   onTabChange={setTab}
 *   workspaceName="Acme Corp"
 *   userRole="owner"
 * >
 *   {content}
 * </SettingsModal>
 */
export function SettingsModal({
  open,
  onOpenChange,
  currentTab,
  onTabChange,
  children,
  workspaceName,
  userRole,
}: SettingsModalProps) {
  // Generate dynamic items based on workspace and role
  const dynamicItems = React.useMemo(
    () => getSettingsItems(workspaceName, userRole),
    [workspaceName, userRole]
  )

  return (
    <DialogWithSidebar
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Customize your settings here"
      items={dynamicItems}
      currentItem={currentTab}
      onItemChange={onTabChange}
      showBreadcrumb={true}
    >
      {children}
    </DialogWithSidebar>
  )
}
