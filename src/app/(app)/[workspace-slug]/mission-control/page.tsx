import { redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { buildWorkspaceMissionControlOverviewPath } from '@/lib/projects/urls'
import { getWorkspaceWithAccess } from '@/lib/workspace'

/**
 * Mission Control is the workspace-wide operations surface.
 *
 * Project runs remain available under /projects/[project]/runs; the workspace
 * Mission Control root resolves to its own overview to preserve a clear IA.
 */
export default async function MissionControlPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const { 'workspace-slug': workspaceSlug } = await params
  const userId = await getUserId()

  if (!userId) redirect('/login')

  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) redirect('/login')

  redirect(buildWorkspaceMissionControlOverviewPath(workspaceSlug))
}
