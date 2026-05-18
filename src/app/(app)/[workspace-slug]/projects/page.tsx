import { redirect, notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getDefaultProjectForWorkspace } from '@/lib/db/projects'
import { buildProjectOverviewPath } from '@/lib/projects/urls'
import { getWorkspaceWithAccess } from '@/lib/workspace'

export default async function ProjectsIndexPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) notFound()

  const project = await getDefaultProjectForWorkspace(workspace.id)
  if (!project) redirect(`/${workspaceSlug}/new`)

  redirect(buildProjectOverviewPath(workspaceSlug, project.slug))
}
