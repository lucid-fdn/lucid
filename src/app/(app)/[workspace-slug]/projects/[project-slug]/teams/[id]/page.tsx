import React from 'react'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getAssistantsByProject } from '@/lib/db'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { CrewDetailClient } from '@/components/teams/crew-detail-client'

export default async function ProjectTeamDetailPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string; id: string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug, id } = await params
  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)

  if (!scope) notFound()
  const assistants = await getAssistantsByProject(scope.workspace.id, scope.project.id)

  return (
    <CrewDetailClient
      crewId={id}
      orgId={scope.workspace.id}
      projectId={scope.project.id}
      projectSlug={scope.project.slug}
      workspaceSlug={workspaceSlug}
      assistants={assistants}
    />
  )
}
