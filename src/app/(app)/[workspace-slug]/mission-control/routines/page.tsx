import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { RoutinesClient } from './routines-client'

export default async function RoutinesPage({
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
      title="Routines"
      description="Create, simulate, inspect, and recover recurring or one-shot work across agents, teams, Work Graph, Browser Operator, Knowledge, EHV, plugins, and PM sync."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <RoutinesClient orgId={workspace.id} workspaceSlug={workspaceSlug} />
    </MissionControlSectionShell>
  )
}
