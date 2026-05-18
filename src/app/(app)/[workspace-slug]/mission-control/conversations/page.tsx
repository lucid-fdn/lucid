/**
 * Mission Control — Conversations
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { ConversationsClient } from './conversations-client'

export default async function ConversationsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) return null

  return (
    <MissionControlSectionShell
      title="Conversations"
      description="Review messaging volume, themes, and quality signals."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <ConversationsClient orgId={workspace.id} />
    </MissionControlSectionShell>
  )
}
