/**
 * Mission Control — System Health
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { SystemClient } from './system-client'

export default async function SystemPage({
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
      title="System Health"
      description="Inspect runtime health, ingest pressure, errors, and remediation."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <SystemClient orgId={workspace.id} workspaceSlug={workspaceSlug} />
    </MissionControlSectionShell>
  )
}
