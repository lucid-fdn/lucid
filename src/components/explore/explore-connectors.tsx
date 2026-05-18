import { Suspense } from 'react'
import { SkeletonGrid } from '@/components/marketplace/SkeletonGrid'
import { CategoryNav } from './category-nav'
import { ConnectorGrid } from '@/components/marketplace/connector-grid'
import { AssetGrid } from '@/components/marketplace/asset-grid'
import { getAssets } from '@/lib/marketplace/marketplace-service'
import { CURATED_SECTIONS, SECTION_METADATA } from '@/lib/marketplace/curated-content'
import type { SearchFilters, UiAsset } from '@/lib/marketplace/types'
import type { ExplorePageProps } from './types'

/**
 * Shared Connectors page component
 * Used by both marketing and workspace routes
 */
export async function ExploreConnectors({
  isAuthenticated: _isAuthenticated,
  basePath,
  params,
}: ExplorePageProps) {
  const hasSearch = Boolean(params.q || params.category)

  if (hasSearch) {
    const filters: SearchFilters = {
      q: typeof params.q === 'string' ? params.q : undefined,
      kind: 'CONNECTOR' as SearchFilters['kind'],
      limit: 48,
    }

    const { assets: rawAssets } = await getAssets(filters)
    const assets = rawAssets as unknown as UiAsset[]

    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connectors</h1>
            <p className="text-sm text-muted-foreground">
              847 integrations — Slack, Gmail, Notion, GitHub, Stripe & more
            </p>
          </div>
          <CategoryNav basePath={basePath} />
        </div>

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
                No connectors found
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const topConnectorsData = await getAssets({
    ids: CURATED_SECTIONS.topConnectors.ids,
    kind: 'CONNECTOR' as SearchFilters['kind'],
    limit: CURATED_SECTIONS.topConnectors.limit,
  })

  const allConnectorsData = await getAssets({
    kind: 'CONNECTOR' as SearchFilters['kind'],
    limit: 48,
  })

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connectors</h1>
          <p className="text-sm text-muted-foreground">
            847 integrations — Slack, Gmail, Notion, GitHub, Stripe & more
          </p>
        </div>
        <CategoryNav basePath={basePath} />
      </div>

      <Suspense fallback={<SkeletonGrid count={12} />}>
        <div className="space-y-10">
          <ConnectorGrid
            title={SECTION_METADATA.topConnectors.title}
            description={SECTION_METADATA.topConnectors.description}
            connectors={topConnectorsData.assets}
            viewAllHref={SECTION_METADATA.topConnectors.viewAllHref}
          />

          {allConnectorsData.assets.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">All Connectors</h2>
              <AssetGrid
                initialAssets={allConnectorsData.assets as unknown as UiAsset[]}
                initialCursor={undefined}
                initialFilters={{ kind: 'CONNECTOR' as SearchFilters['kind'], limit: 48 }}
              />
            </section>
          )}
        </div>
      </Suspense>
    </div>
  )
}