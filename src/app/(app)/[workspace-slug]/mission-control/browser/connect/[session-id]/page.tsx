import React from 'react'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { getBrowserOperatorConnectSession } from '@/lib/db/browser-operator'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { BrowserSecureTakeoverPanel } from '@/components/browser-operator/secure-takeover-panel'

export default async function BrowserSecureTakeoverPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'session-id': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'session-id': sessionId } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) return null

  const session = await getBrowserOperatorConnectSession({
    orgId: workspace.id,
    connectSessionId: sessionId,
  })
  if (!session) notFound()

  return (
    <MissionControlSectionShell
      title="Secure Browser Takeover"
      description="Connect a merchant account once using a provider browser profile/context. Lucid keeps the canonical account and policy state."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <BrowserSecureTakeoverPanel orgId={workspace.id} session={session} />
    </MissionControlSectionShell>
  )
}
