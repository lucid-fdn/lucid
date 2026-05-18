import { notFound, redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getCrew } from '@/lib/db/crews'
import { getPrimaryProjectForWorkspace, getProjectByIdForWorkspace } from '@/lib/db/projects'
import { buildProjectTeamDetailPath } from '@/lib/projects/urls'
import { getWorkspaceWithAccess } from '@/lib/workspace'

/**
 * Legacy Mission Control team detail route.
 * Teams are project-scoped, so old workspace-level links redirect to the canonical project Team page.
 */
export default async function MissionControlCrewDetailRedirectPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; id: string }>
}) {
  const { 'workspace-slug': workspaceSlug, id: crewId } = await params
  const userId = await getUserId()

  if (!userId) redirect('/login')

  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) redirect('/login')

  const crew = await getCrew(crewId, workspace.id)
  if (!crew) notFound()

  const project = crew.project_id
    ? await getProjectByIdForWorkspace(workspace.id, crew.project_id)
    : await getPrimaryProjectForWorkspace(workspace.id)

  if (!project) notFound()

  redirect(buildProjectTeamDetailPath(workspaceSlug, project.slug, crewId))
}
