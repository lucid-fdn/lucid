/**
 * Mission Control Layout
 * Pattern: /{workspace-slug}/mission-control/*
 *
 * Reuses existing auth, sidebar, and workspace context.
 * The app sidebar switches into Mission Control mode for local module navigation.
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { CopilotTrigger } from '@/components/mission-control/copilot/copilot-trigger'

export default async function MissionControlLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) {
    return null // Layout handles access control
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">{children}</div>
      <CopilotTrigger orgId={workspace.id} workspaceName={workspace.name} />
    </div>
  )
}
