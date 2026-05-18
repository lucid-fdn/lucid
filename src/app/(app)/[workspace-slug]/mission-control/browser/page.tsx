/**
 * Mission Control - Browser Operator
 *
 * Focused operator surface for browser procedures, host playbooks, live
 * session handoffs, pair-agent browser sharing, and Trust Shield events.
 */

import React from 'react'
import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { BrowserOperatorConsole } from '@/components/browser-operator/browser-operator-console'

export default async function BrowserOperatorPage({
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
      title="Browser Operator"
      description="Review browser automation, live handoffs, and safety evidence."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <BrowserOperatorConsole orgId={workspace.id} workspaceSlug={workspaceSlug} />
    </MissionControlSectionShell>
  )
}
