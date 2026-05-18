import React from 'react'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { WorkspaceTemplatesPage } from '../../../templates/workspace-templates-page'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'

export const dynamic = 'force-dynamic'

export default async function ProjectTemplatesPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  return (
    <WorkspaceTemplatesPage
      orgId={scope.workspace.id}
      workspaceSlug={workspaceSlug}
      projectId={scope.project.id}
      projectSlug={scope.project.slug}
    />
  )
}
