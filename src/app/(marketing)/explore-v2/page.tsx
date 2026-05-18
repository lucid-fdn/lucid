import { ExploreHub } from '@/components/explore'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Marketing Explore Hub — Public (no auth required)
 * Thin wrapper that delegates to shared ExploreHub component
 */
export default async function MarketingExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  return (
    <ExploreHub
      isAuthenticated={false}
      basePath="/explore-v2"
      params={params}
    />
  )
}