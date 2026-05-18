import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { CommerceClient } from './commerce-client'

export default async function CommercePage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) return null

  return (
    <CommerceClient
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
      currentUserId={userId}
    />
  )
}
