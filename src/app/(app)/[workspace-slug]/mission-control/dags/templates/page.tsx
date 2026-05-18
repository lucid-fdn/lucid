/**
 * Mission Control - Workflow Templates
 *
 * Operator surface to list, create, and edit org-scoped workflow templates.
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { DagTemplatesClient } from './dag-templates-client'

export default async function DagTemplatesPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) return null

  return <DagTemplatesClient orgId={workspace.id} />
}


