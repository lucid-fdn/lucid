import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { RoutineDetailClient } from './routine-detail-client'

export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'routine-id': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'routine-id': routineId } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) return null

  return (
    <MissionControlSectionShell
      title="Routine Detail"
      description="Inspect schedule state, run receipts, revisions, drift, and runtime policy for a single routine."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <RoutineDetailClient
        orgId={workspace.id}
        workspaceSlug={workspaceSlug}
        routineId={routineId}
      />
    </MissionControlSectionShell>
  )
}
