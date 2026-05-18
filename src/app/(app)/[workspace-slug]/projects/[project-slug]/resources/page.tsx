import { redirect } from 'next/navigation'
import { buildProjectAgentsPath } from '@/lib/projects/urls'

export default async function ProjectResourcesPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params
  redirect(buildProjectAgentsPath(workspaceSlug, projectSlug))
}
