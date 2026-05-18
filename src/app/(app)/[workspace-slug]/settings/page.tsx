/**
 * Workspace Settings
 * Pattern: /{workspace-slug}/settings
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { hasPermission } from '@/lib/access-control'
import Link from 'next/link'
import { ArrowRight, Bell, CreditCard, Lock, Settings, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageHeader, PageSection, PageShell } from '@/components/page'

export default async function WorkspaceSettings({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const { 'workspace-slug': workspaceSlug } = await params
  const userId = await requireUserId()
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  
  if (!workspace) {
    return null // Layout handles access control
  }
  
  // Check permissions (using role-based access)
  const canManageSettings = await hasPermission(workspace.id, userId, 'manageWorkspace')
  const canManageBilling = await hasPermission(workspace.id, userId, 'manageWorkspace')
  const canManageMembers = await hasPermission(workspace.id, userId, 'inviteMembers')
  
  const settingsSections = [
    {
      name: 'General',
      description: 'Workspace name, logo, and basic settings',
      icon: Settings,
      href: `/${workspace.slug}/settings/general`,
      allowed: canManageSettings,
      ownerOnly: true,
    },
    {
      name: 'Team',
      description: 'Manage members, roles, and invitations',
      icon: Users,
      href: `/${workspace.slug}/settings/team`,
      allowed: canManageMembers,
      ownerOnly: false,
    },
    {
      name: 'Billing',
      description: 'Subscription, usage, and payment settings',
      icon: CreditCard,
      href: `/${workspace.slug}/settings/billing`,
      allowed: canManageBilling,
      ownerOnly: true,
    },
    {
      name: 'Notifications',
      description: 'Configure workspace notifications',
      icon: Bell,
      href: `/${workspace.slug}/settings/notifications`,
      allowed: true, // Everyone can manage their own notifications
      ownerOnly: false,
    },
  ].filter(section => section.allowed)
  
  return (
    <PageShell contentClassName="gap-6 px-6 py-6">
      <PageHeader
        className="rounded-2xl border border-b border-border/70 bg-card/40 px-5 py-4"
        title="Workspace settings"
        description={`Manage ${workspace.name} members, billing, notifications, and workspace-level configuration.`}
      />

      <PageSection
        title="Settings"
        description="Everything here is scoped to the current workspace. Project-specific behavior stays in Project Settings."
        contentClassName="grid gap-3 p-3 md:grid-cols-2"
      >
        {settingsSections.map((section) => (
          <Link
            key={section.name}
            href={section.href}
            className="group flex min-h-[120px] items-start gap-4 rounded-xl border border-border/70 bg-background/70 p-4 transition-colors hover:border-border hover:bg-accent/25"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition-colors group-hover:text-foreground">
              <section.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">{section.name}</h3>
                {section.ownerOnly && (
                  <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
                    <Lock className="h-3 w-3" />
                    Owner
                  </Badge>
                )}
              </div>
              <p className="text-sm leading-5 text-muted-foreground">{section.description}</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </PageSection>
    </PageShell>
  )
}
