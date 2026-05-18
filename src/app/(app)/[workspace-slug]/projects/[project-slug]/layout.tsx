import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  return (
    <div className="min-h-0 flex-1">{children}</div>
  )
}
