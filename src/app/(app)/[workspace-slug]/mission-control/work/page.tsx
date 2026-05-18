/**
 * Mission Control — Work (Human Work Items)
 *
 * Phase 1 of docs/plans/2026-04-08-pulse-nerve-human-pm-integration.md.
 * Internal PM surface for the unified human work ledger: Pulse-standalone
 * jobs, tickets, approvals, and workflow handoffs.
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { WorkItemsClient } from './work-items-client'

export default async function WorkItemsPage({
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
      title="Work"
      description="Review approvals, tickets, and handoffs that need a person."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <WorkItemsClient
        orgId={workspace.id}
        currentUserId={userId}
        showHeader={false}
      />
    </MissionControlSectionShell>
  )
}

