import { requireUserId } from '@/lib/auth/session'
import { ExploreConnectors } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ExploreConnectorsPage({
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
    <ExploreConnectors
      isAuthenticated
      basePath={`/${workspaceSlug}/explore`}
      params={sp}
    />
  )
}
