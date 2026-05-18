import React from 'react'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getAssistantsByProject, getMCFeedEvents, getPendingApprovals } from '@/lib/db'
import { isInternalWorkspace } from '@/lib/auth/internal'
import { getEngineDeployReadiness } from '@/lib/engines/deploy-readiness'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { getUnifiedSkillsForOrg } from '@/lib/db/unified-skills'
import { listDeployableTemplateCatalogEntries } from '@/lib/templates/library-server'
import { AgentsPageShell } from '@/components/agents/agents-page-shell'

export default async function ProjectAgentsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  const { workspace, project } = scope
  const [assistants, initialFeedEvents, initialApprovals, catalogTemplates, initialAvailableUnifiedSkills] = await Promise.all([
    getAssistantsByProject(workspace.id, project.id),
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
      projectId={project.id}
      projectSlug={project.slug}
      hermesManagedReadiness={getEngineDeployReadiness({ engine: 'hermes', runtimeFlavor: 'c1_managed' })}
      hermesByoReadiness={getEngineDeployReadiness({ engine: 'hermes', runtimeFlavor: 'c2a_autonomous' })}
      initialViewMode="canvas"
      title="Agents"
      emptyTitle="No agents yet"
      emptyDescription="Create your first agent for this project from the canvas, then manage it here."
      initialFeedEvents={initialFeedEvents}
      initialApprovals={initialApprovals}
      catalogTemplates={catalogTemplates}
      initialAvailableUnifiedSkills={initialAvailableUnifiedSkills}
      isInternal={isInternalWorkspace(workspace.id, workspace.slug)}
    />
  )
}
