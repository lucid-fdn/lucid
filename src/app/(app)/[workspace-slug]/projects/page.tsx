import * as React from 'react'
import { redirect, notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getAssistants } from '@/lib/db'
import { getProjectSummariesForWorkspace, type ProjectSummary } from '@/lib/db/projects'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import {
  WorkspaceProjectsBrowser,
  type ProjectBrowserProject,
} from '@/components/projects/workspace-projects-browser'

type AssistantForProjectList = Awaited<ReturnType<typeof getAssistants>>[number]

export default async function ProjectsIndexPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) notFound()

  const projects = await getProjectSummariesForWorkspace(workspace.id)
  if (projects.length === 0) redirect(`/${workspaceSlug}/new`)

  const assistants = await getAssistants(workspace.id)

  return (
    <WorkspaceProjectsBrowser
      workspaceSlug={workspaceSlug}
      projects={toProjectBrowserProjects(projects, assistants)}
    />
  )
}

function toProjectBrowserProjects(
  projects: ProjectSummary[],
  assistants: AssistantForProjectList[],
): ProjectBrowserProject[] {
  const assistantsByProjectId = new Map<string, AssistantForProjectList[]>()

  for (const assistant of assistants) {
    if (!assistant.project_id) continue
    const list = assistantsByProjectId.get(assistant.project_id) ?? []
    list.push(assistant)
    assistantsByProjectId.set(assistant.project_id, list)
  }

  return projects.map((project) => {
    const projectAssistants = assistantsByProjectId.get(project.id) ?? []
    const channelSlugs = new Set<string>()
    const integrationSlugs = new Set<string>()
    const engines = new Set<string>()

    for (const assistant of projectAssistants) {
      if (assistant.engine) engines.add(assistant.engine)

      for (const channel of assistant.assistant_channels ?? []) {
        if (channel?.is_active && channel.channel_type) {
          channelSlugs.add(channel.channel_type)
        }
      }

      for (const activation of assistant.assistant_plugin_activations ?? []) {
        const slug = getJoinedCatalogSlug(activation, 'org_plugin_installations', 'plugin_catalog')
        if (activation?.is_active && slug) integrationSlugs.add(slug)
      }

      for (const activation of assistant.assistant_skill_activations ?? []) {
        const slug = getJoinedCatalogSlug(activation, 'org_skill_installations', 'skill_catalog')
        if (activation?.is_active && slug) integrationSlugs.add(slug)
      }
    }

    return {
      ...project,
      channelSlugs: Array.from(channelSlugs),
      integrationSlugs: Array.from(integrationSlugs),
      engines: Array.from(engines),
      totalAgents: projectAssistants.length || project.counts.assistants,
      liveAgents: projectAssistants.filter((assistant) => assistant.is_active).length,
    }
  })
}

function getJoinedCatalogSlug(
  value: unknown,
  installationKey: string,
  catalogKey: string,
): string | null {
  const activation = value as Record<string, unknown> | null | undefined
  const installation = firstRecord(activation?.[installationKey])
  const catalog = firstRecord(installation?.[catalogKey])
  const slug = catalog?.slug
  return typeof slug === 'string' && slug.length > 0 ? slug : null
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return firstRecord(value[0])
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return null
}
