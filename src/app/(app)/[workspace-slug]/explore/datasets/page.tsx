import { requireUserId } from '@/lib/auth/session'
import { ExploreCategory } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Workspace Datasets Page — Authenticated
 * Thin wrapper that delegates to shared ExploreCategory component
 */
export default async function DatasetsPage({
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
      isAuthenticated={true}
      basePath={`/${workspaceSlug}/explore`}
      params={sp}
      title="Datasets"
      subtitle="Training datasets for fine-tuning, evaluation & benchmarking"
      kind="DATASET"
    />
  )
}