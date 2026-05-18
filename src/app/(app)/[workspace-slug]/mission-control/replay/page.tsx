/**
 * Mission Control — Replay Browser
 * Pattern: /{workspace-slug}/mission-control/replay
 *
 * Browse past conversations, filter by agent/date/outcome,
 * then click into a run to see step-by-step replay.
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { getMCAgentList } from '@/lib/db'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { ReplayClient } from './replay-client'

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) {
    return null
  }

  // Fetch agent list for filter dropdown
  const agents = await getMCAgentList(workspace.id)

  return (
    <MissionControlSectionShell
      title="Replay"
      description="Inspect conversation history, failures, and outcomes."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <ReplayClient
        orgId={workspace.id}
        workspaceSlug={workspaceSlug}
        agents={agents}
      />
    </MissionControlSectionShell>
  )
}
