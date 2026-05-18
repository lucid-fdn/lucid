import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import {
  getNativeMutationOpsSummary,
  getOrgNativeMutationCandidates,
} from '@/lib/db/mission-control'
import { ProposedChangesClient } from './mutations-client'

export default async function ProposedChangesPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) return null

  const [summary, candidates] = await Promise.all([
    getNativeMutationOpsSummary(workspace.id),
    getOrgNativeMutationCandidates(workspace.id, { limit: 100 }),
  ])

  return (
    <ProposedChangesClient
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
      initialSummary={summary}
      initialCandidates={candidates}
    />
  )
}
