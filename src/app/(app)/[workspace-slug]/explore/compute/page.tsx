import { requireUserId } from '@/lib/auth/session'
import { ExploreCompute } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ExploreComputePage({
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
    <ExploreCompute
      isAuthenticated
      basePath={`/${workspaceSlug}/explore`}
      params={sp}
    />
  )
}
