import { requireUserId } from '@/lib/auth/session'
import { ExploreHub } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Workspace Explore Hub — Authenticated
 * Thin wrapper that delegates to shared ExploreHub component
 */
export default async function ExploreHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'workspace-slug': string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const sp = await searchParams

  return (
    <ExploreHub
      isAuthenticated={true}
      basePath={`/${workspaceSlug}/explore`}
      params={sp}
    />
  )
}