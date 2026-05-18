/**
 * Mission Control - Spend
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { SpendClient } from './economics-client'

export default async function SpendPage({
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
      title="Spend"
      description="Track workspace spend, concentration, and savings opportunities."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <SpendClient orgId={workspace.id} />
    </MissionControlSectionShell>
  )
}

