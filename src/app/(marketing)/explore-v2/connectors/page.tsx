import { ExploreConnectors } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Marketing Connectors Page — Public (no auth required)
 */
export default async function MarketingConnectorsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  return (
    <ExploreConnectors
      isAuthenticated={false}
      basePath="/explore-v2"
      params={params}
    />
  )
}