import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { WorkspaceTemplatesPage } from './workspace-templates-page'

export const dynamic = 'force-dynamic'

export default async function WorkspaceTemplatesRoute({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) notFound()

  return (
    <WorkspaceTemplatesPage
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    />
  )
}
