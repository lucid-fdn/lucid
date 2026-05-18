/**
 * Mission Control — A/B Experiments
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { ExperimentsClient } from './experiments-client'

export default async function ExperimentsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) return null

  return <ExperimentsClient orgId={workspace.id} workspaceSlug={workspaceSlug} />
}
