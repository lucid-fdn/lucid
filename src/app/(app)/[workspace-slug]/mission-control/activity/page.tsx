import { requireUserId } from '@/lib/auth/server-utils'
import { getMCAgentList, getMCFeedEvents } from '@/lib/db'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { ActivityClient } from '@/components/mission-control/activity-client'

export default async function MissionControlActivityPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) return null

  const [events, agents] = await Promise.all([
    withActivityTimeout(getMCFeedEvents(workspace.id, { limit: 100 }), []),
    withActivityTimeout(getMCAgentList(workspace.id), []),
  ])

  return (
    <MissionControlSectionShell
      title="Activity"
      description="Follow the workspace timeline across projects, agents, and runtimes."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <ActivityClient
        orgId={workspace.id}
        workspaceSlug={workspaceSlug}
        initialEvents={events}
        agents={agents}
      />
    </MissionControlSectionShell>
  )
}

function withActivityTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 12_000): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timeout)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timeout)
        resolve(fallback)
      })
  })
}
