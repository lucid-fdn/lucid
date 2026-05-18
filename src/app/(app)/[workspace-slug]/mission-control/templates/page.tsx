/**
 * Mission Control - Templates
 *
 * Operator view for template funnel health: preview, install, first run, and
 * repeat use. The template library stays the user-facing marketplace; this
 * page is the conversion cockpit for deciding what needs polish.
 */

import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { TemplateAnalyticsDashboard } from '@/components/templates/template-analytics-dashboard'

export default async function MissionControlTemplatesPage({
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
      title="Templates"
      description="Track template conversion from preview to install, first run, repeat use, and drop-off."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <TemplateAnalyticsDashboard orgId={workspace.id} workspaceSlug={workspaceSlug} />
    </MissionControlSectionShell>
  )
}
