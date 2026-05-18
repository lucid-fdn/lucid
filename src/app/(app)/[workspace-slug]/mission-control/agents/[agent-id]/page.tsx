import { notFound, redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant } from '@/lib/db'
import { getPrimaryProjectForWorkspace, getProjectByIdForWorkspace } from '@/lib/db/projects'
import { buildProjectAgentDetailPath } from '@/lib/projects/urls'
import { getWorkspaceWithAccess } from '@/lib/workspace'

/**
 * Mission Control Agent Detail — redirects to the canonical project-scoped agent detail page.
 */
export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'agent-id': string }>
}) {
  const { 'workspace-slug': workspaceSlug, 'agent-id': agentId } = await params
  const userId = await getUserId()

  if (!userId) redirect('/login')

  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) redirect('/login')

  const assistant = await getAssistant(agentId)
  if (!assistant || assistant.org_id !== workspace.id) notFound()

  const project = assistant.project_id
    ? await getProjectByIdForWorkspace(workspace.id, assistant.project_id)
    : await getPrimaryProjectForWorkspace(workspace.id)

  if (!project) notFound()

  redirect(buildProjectAgentDetailPath(workspaceSlug, project.slug, agentId))
}
