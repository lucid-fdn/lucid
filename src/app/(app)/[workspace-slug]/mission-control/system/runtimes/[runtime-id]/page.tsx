/**
 * Mission Control — Runtime Detail
 * Pattern: /{workspace-slug}/mission-control/system/runtimes/[runtime-id]
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { RuntimeDetailClient } from './runtime-detail-client'

export default async function RuntimeDetailPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'runtime-id': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'runtime-id': runtimeId } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) return null

  return (
    <RuntimeDetailClient
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
      runtimeId={runtimeId}
    />
  )
}
