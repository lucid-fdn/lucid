import { ExploreCompute } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Marketing Compute Page — Public (no auth required)
 */
export default async function MarketingComputePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  return (
    <ExploreCompute
      isAuthenticated={false}
      basePath="/explore-v2"
      params={params}
    />
  )
}