import { ExploreCategory } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Marketing Datasets Page — Public (no auth required)
 */
export default async function MarketingDatasetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  return (
    <ExploreCategory
      isAuthenticated={false}
      basePath="/explore-v2"
      params={params}
      title="Datasets"
      subtitle="Training datasets, fine-tuning data & evaluation benchmarks"
      kind="DATASET"
    />
  )
}