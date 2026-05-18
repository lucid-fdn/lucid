/**
 * Mission Control — Agent Ops
 *
 * Product-level workflow surface for investigate/review/QA/ship/canary runs.
 * Execution remains behind Agent Ops adapters; this page only launches and
 * operates durable `agent_ops_runs`.
 */

import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { AgentOpsClient } from './agent-ops-client'

export default async function AgentOpsPage({
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
      title="Agent Ops"
      description="Launch repeatable workflows and inspect their receipts."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <AgentOpsClient orgId={workspace.id} workspaceSlug={workspaceSlug} />
    </MissionControlSectionShell>
  )
}
