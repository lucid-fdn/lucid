/**
 * Workspace Dashboard — Fleet Operations
 * Pattern: /{workspace-slug}/dashboard
 *
 * Answers: Which agents need action? What is the fleet state? Where to click first?
 */

import React from 'react'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { getAssistants } from '@/lib/db'
import { getPrimaryProjectForWorkspace } from '@/lib/db/projects'
import { FleetDashboard } from '@/components/dashboard/fleet-dashboard'
import { redirect } from 'next/navigation'

export default async function WorkspaceDashboard({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) {
    return null // Layout handles access control
  }

  const primaryProject = await getPrimaryProjectForWorkspace(workspace.id)
  if (!primaryProject) {
    redirect(`/${workspaceSlug}/new`)
  }

  // Server-prefetch agents for SSR
  const agents = await getAssistants(workspace.id)

  // Build initial health scores map from agents (MC health scores are polled client-side)
  const healthScores: Record<string, number | null> = {}
  for (const agent of agents) {
    healthScores[agent.id] = null
  }

  return (
    <div className="h-full bg-background">
      <FleetDashboard
        agents={agents}
        orgId={workspace.id}
        workspaceSlug={workspaceSlug}
        primaryProject={{
          name: primaryProject.name,
          slug: primaryProject.slug,
        }}
        healthScores={healthScores}
      />
    </div>
  )
}
