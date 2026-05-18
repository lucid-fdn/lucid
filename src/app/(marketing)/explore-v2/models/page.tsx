import { ExploreModels } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Marketing Models Page — Public (no auth required)
 */
export default async function MarketingModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  return (
    <ExploreModels
      isAuthenticated={false}
      basePath="/explore-v2"
      params={params}
    />
  )
}