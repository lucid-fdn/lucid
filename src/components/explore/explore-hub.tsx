import { Suspense } from 'react'
import { SkeletonGrid } from '@/components/marketplace/SkeletonGrid'
import { ExploreSections } from '@/app/(app)/explore/explore-sections'
import { CategoryNav } from './category-nav'
import { SearchControls } from '@/components/marketplace/search-controls'
import { AssetGrid } from '@/components/marketplace/asset-grid'
import { getAssets } from '@/lib/marketplace/marketplace-service'
import type { SearchFilters, UiAsset } from '@/lib/marketplace/types'
import type { ExplorePageProps } from './types'

export const ExploreHubDynamic = 'force-dynamic'

/**
 * Shared Explore Hub component
 * Used by both marketing (/explore-v2) and workspace (/[slug]/explore-v2) routes
 */
export async function ExploreHub({
  isAuthenticated,
  basePath,
  params,
}: ExplorePageProps) {
  const hasSearch = Boolean(params.q)

  // SEARCH MODE: Show unified search results
  if (hasSearch) {
    const filters: SearchFilters = {
      q: typeof params.q === 'string' ? params.q : undefined,
      kind: typeof params.kind === 'string' ? (params.kind as SearchFilters['kind']) : undefined,
      limit: 24,
    }

    const { assets: rawAssets } = await getAssets(filters)
    const assets = rawAssets as unknown as UiAsset[]

    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
            <p className="text-sm text-muted-foreground">
              Discover AI models, GPU compute, connectors, agents & datasets
            </p>
          </div>
          <CategoryNav basePath={basePath} />
        </div>

        <SearchControls initialFilters={filters} />

        <div>
          {assets.length > 0 ? (
            <AssetGrid
              initialAssets={assets}
              initialCursor={undefined}
              initialFilters={filters}
            />
          ) : (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">
                No results found for &ldquo;{params.q}&rdquo;
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or browse by category above
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // DISCOVERY MODE: Curated hub (Apple "Today" tab)
  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
          <p className="text-sm text-muted-foreground">
            Discover AI models, GPU compute, connectors, agents & datasets
          </p>
        </div>
        <CategoryNav basePath={basePath} />
      </div>

      <Suspense fallback={<SkeletonGrid count={12} />}>
        <ExploreSections isAuthenticated={isAuthenticated} />
      </Suspense>
    </div>
  )
}