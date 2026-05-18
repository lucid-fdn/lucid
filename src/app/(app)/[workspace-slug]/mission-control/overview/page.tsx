import { requireUserId } from '@/lib/auth/server-utils'
import { getMissionControlOverview } from '@/lib/db'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { WorkspaceOpsOverview } from '@/components/mission-control/workspace-ops-overview'

export default async function MissionControlOverviewPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) return null

  const overview = await getMissionControlOverview(workspace.id)

  return (
    <MissionControlSectionShell
      title="Overview"
      description="See what needs attention across projects, runs, reliability, and spend."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <WorkspaceOpsOverview data={overview} workspaceSlug={workspaceSlug} />
    </MissionControlSectionShell>
  )
}
