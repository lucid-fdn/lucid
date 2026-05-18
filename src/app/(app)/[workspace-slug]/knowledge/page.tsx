import { notFound } from 'next/navigation'

import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { loadKnowledgeManagerData } from '@/features/knowledge-manager/loaders'
import { KnowledgeManagerClient } from './knowledge-manager-client'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) notFound()

  const data = await loadKnowledgeManagerData({
    orgId: workspace.id,
    orgName: workspace.name,
    projectId: null,
    projectName: null,
  })

  return <KnowledgeManagerClient data={data} workspaceSlug={workspaceSlug} />
}

export const metadata = {
  title: 'Workspace Brain | Lucid',
  description: 'Manage operating context, knowledge, review quality, and recall for workspace agents.',
}
