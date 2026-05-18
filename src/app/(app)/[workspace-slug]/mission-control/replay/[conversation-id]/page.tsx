/**
 * Mission Control — Replay Detail
 * Pattern: /{workspace-slug}/mission-control/replay/[conversation-id]
 *
 * Step-by-step run viewer: tool calls, outputs, errors, costs per step.
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { ReplayDetailClient } from './replay-detail-client'

export default async function ReplayDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'workspace-slug': string; 'conversation-id': string }>
  searchParams: Promise<{ org_id?: string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'conversation-id': conversationId } = await params
  await searchParams
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) {
    return null
  }

  return (
    <ReplayDetailClient
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
      conversationId={conversationId}
    />
  )
}
