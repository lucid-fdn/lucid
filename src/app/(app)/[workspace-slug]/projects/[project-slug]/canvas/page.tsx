import { redirect } from 'next/navigation'
import { buildProjectAgentsPath } from '@/lib/projects/urls'

export default async function ProjectCanvasLegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params
  const resolvedSearchParams = (await searchParams) ?? {}
  const nextParams = new URLSearchParams({ view: 'canvas' })

  for (const key of ['agent', 'createdAgent', 'focus']) {
    const value = resolvedSearchParams[key]
    const normalized = Array.isArray(value) ? value[0] : value
    if (normalized) nextParams.set(key, normalized)
  }

  redirect(`${buildProjectAgentsPath(workspaceSlug, projectSlug)}?${nextParams.toString()}`)
}
