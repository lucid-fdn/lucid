import React from 'react'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getProjectResourceCounts, getProjectSettings } from '@/lib/db/projects'
import { getWorkspaceCapabilities } from '@/lib/workspace/capabilities'
import { getProjectOverviewProjection } from '@/lib/projects/read-model'
import { ProjectSettingsClient } from '@/components/projects/project-settings-client'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  const counts = await getProjectResourceCounts(scope.workspace.id, scope.project.id)
  const [overview, capabilities, settings] = await Promise.all([
    getProjectOverviewProjection(scope.workspace.id, scope.project.id),
    getWorkspaceCapabilities(userId, scope.workspace.id),
    getProjectSettings(scope.workspace.id, scope.project.id),
  ])

  return (
    <ProjectSettingsClient
      workspaceSlug={workspaceSlug}
      project={scope.project}
      counts={counts}
      overview={overview}
      settings={settings}
      capabilities={{
        planName: capabilities.planName,
        role: capabilities.role,
        gatewayKeysState: capabilities.gatewayKeysState,
        canManageGatewayKeys: capabilities.canManageGatewayKeys,
        canViewAudit: capabilities.canViewAudit,
      }}
    />
  )
}
