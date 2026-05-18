import { requireUserId } from '@/lib/auth/session'
import { ExploreModels } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Workspace Models Page — Authenticated
 * Thin wrapper that delegates to shared ExploreModels component
 */
export default async function ModelsPage({
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
    <ExploreModels
      isAuthenticated={true}
      basePath={`/${workspaceSlug}/explore`}
      params={sp}
    />
  )
}