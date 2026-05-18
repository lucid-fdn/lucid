/**
 * Workspace Layout
 * Validates user has access to this workspace.
 * Pattern: /{workspace-slug}/*
 */

import { notFound, redirect } from 'next/navigation'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { getUserId } from '@/lib/auth/server-utils'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ 'workspace-slug': string }>
}) {
  const { 'workspace-slug': workspaceSlug } = await params
  const userId = await getUserId()

  if (!userId) redirect('/login')

  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) notFound()

  return <>{children}</>
}
