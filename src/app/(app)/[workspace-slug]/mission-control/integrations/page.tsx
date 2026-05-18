/**
 * Mission Control — Integrations
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { IntegrationsClient } from './integrations-client'

export default async function IntegrationsPage({
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
      title="Integrations"
      description="Monitor connected channels, plugins, and managed packs."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <IntegrationsClient orgId={workspace.id} />
    </MissionControlSectionShell>
  )
}
