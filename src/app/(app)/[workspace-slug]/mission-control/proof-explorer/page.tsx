/**
 * Mission Control - Proof Receipts
 * Pattern: /{workspace-slug}/mission-control/proof-explorer
 *
 * Verifiable AI action receipts with policy snapshots and lineage.
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { getMCAgentList } from '@/lib/db'
import { ProofReceiptsClient } from './proof-explorer-client'

export default async function ProofReceiptsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) {
    return null
  }

  const agents = await getMCAgentList(workspace.id)

  return (
    <ProofReceiptsClient
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
      agents={agents}
    />
  )
}

