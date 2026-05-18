import { requireUserId } from '@/lib/auth/session'
import { ExploreCategory } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ExploreAgentsPage({
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
    <ExploreCategory
      isAuthenticated
      basePath={`/${workspaceSlug}/explore`}
      params={sp}
      title="Agents"
      subtitle="Reusable agents, operating patterns, and launch-ready automation templates"
      kind="AGENT"
    />
  )
}
