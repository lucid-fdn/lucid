import React from 'react'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getAssistantsByProject } from '@/lib/db'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { CrewsListClient } from '@/components/teams/crews-list-client'

export default async function ProjectTeamsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params
  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)

  if (!scope) notFound()

  const assistants = await getAssistantsByProject(scope.workspace.id, scope.project.id)

  return (
    <CrewsListClient
      orgId={scope.workspace.id}
      projectId={scope.project.id}
      projectSlug={scope.project.slug}
      workspaceSlug={workspaceSlug}
      title="Teams"
      description="Coordinate agents into repeatable multi-agent groups inside this project."
      emptyDescription="No teams yet. Start from the canvas or group a few agents into a team."
      assistants={assistants}
    />
  )
}
