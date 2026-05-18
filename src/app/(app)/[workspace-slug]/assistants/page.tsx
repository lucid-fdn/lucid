import React from 'react'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getAssistants, getMCFeedEvents, getPendingApprovals } from '@/lib/db'
import { getUnifiedSkillsForOrg } from '@/lib/db/unified-skills'
import { isInternalWorkspace } from '@/lib/auth/internal'
import { getEngineDeployReadiness } from '@/lib/engines/deploy-readiness'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { listDeployableTemplateCatalogEntries } from '@/lib/templates/library-server'
import { AgentsPageShell } from '@/components/agents/agents-page-shell'

export default async function WorkspaceAgentsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) notFound()

  const [assistants, initialFeedEvents, initialApprovals, catalogTemplates, initialAvailableUnifiedSkills] = await Promise.all([
    getAssistants(workspace.id),
    getMCFeedEvents(workspace.id, { limit: 50 }).catch(() => []),
    getPendingApprovals(workspace.id).catch(() => []),
    listDeployableTemplateCatalogEntries({ orgId: workspace.id }),
    getUnifiedSkillsForOrg({ orgId: workspace.id }),
  ])

  return (
    <AgentsPageShell
      assistants={assistants}
      workspaceSlug={workspaceSlug}
      workspaceId={workspace.id}
      hermesManagedReadiness={getEngineDeployReadiness({ engine: 'hermes', runtimeFlavor: 'c1_managed' })}
      hermesByoReadiness={getEngineDeployReadiness({ engine: 'hermes', runtimeFlavor: 'c2a_autonomous' })}
      initialViewMode="canvas"
      title="All Agents"
      emptyTitle="No agents yet"
      emptyDescription="Agents live inside projects. Create or open a project to add agents, then manage every workspace agent here."
      initialFeedEvents={initialFeedEvents}
      initialApprovals={initialApprovals}
      catalogTemplates={catalogTemplates}
      initialAvailableUnifiedSkills={initialAvailableUnifiedSkills}
      isInternal={isInternalWorkspace(workspace.id, workspace.slug)}
    />
  )
}
