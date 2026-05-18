import { Suspense } from 'react'
import { SkeletonGrid } from '@/components/marketplace/SkeletonGrid'
import { CategoryNav } from './category-nav'
import { SearchControls } from '@/components/marketplace/search-controls'
import { AssetGrid } from '@/components/marketplace/asset-grid'
import { AssetSection } from '@/components/marketplace/asset-section'
import { getAssets } from '@/lib/marketplace/marketplace-service'
import type { AssetKind, SearchFilters, UiAsset } from '@/lib/marketplace/types'
import type { ExplorePageProps } from './types'

interface CategorySectionConfig {
  title: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts CuratedModel[], Asset[], UiAsset[]
  assets: any[]
  viewAllHref?: string
}

interface ExploreCategoryProps extends ExplorePageProps {
  /** Page title (e.g., "Agents", "Datasets") */
  title: string
  /** Page subtitle */
  subtitle: string
  /** Asset kind filter */
  kind: string
  /** Curated sections for discovery mode */
  sections?: CategorySectionConfig[]
}

/**
 * Generic category page component for simple categories (Agents, Datasets)
 * Used by both marketing and workspace routes
 */
export async function ExploreCategory({
  isAuthenticated,
  basePath,
  params,
  title,
  subtitle,
  kind,
  sections,
}: ExploreCategoryProps) {
  const hasSearch = Boolean(params.q || params.sort || params.tags)

  if (hasSearch) {
    const filters: SearchFilters = {
      q: typeof params.q === 'string' ? params.q : undefined,
      kind: kind as AssetKind,
      tags: typeof params.tags === 'string' ? params.tags.split(',') : undefined,
      sort: typeof params.sort === 'string' ? (params.sort as SearchFilters['sort']) : 'relevance',
      limit: 24,
    }

    const { assets: rawAssets } = await getAssets(filters)
    const assets = rawAssets as unknown as UiAsset[]

    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
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
                No {title.toLowerCase()} found matching your criteria
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Fetch assets for discovery
  const { assets: allAssets } = await getAssets({
    kind: kind as AssetKind,
    limit: 24,
  })

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <CategoryNav basePath={basePath} />
      </div>

      <Suspense fallback={<SkeletonGrid count={12} />}>
        <div className="space-y-12">
          {/* Curated sections if provided */}
          {sections?.map((section) => (
            <AssetSection
              key={section.title}
              title={section.title}
              description={section.description}
              assets={section.assets}
              viewAllHref={section.viewAllHref}
              isAuthenticated={isAuthenticated}
            />
          ))}

          {/* All assets grid */}
          {allAssets.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">All {title}</h2>
              <AssetGrid
                initialAssets={allAssets as unknown as UiAsset[]}
                initialCursor={undefined}
                initialFilters={{ kind: kind as AssetKind, limit: 24 }}
              />
            </section>
          )}
        </div>
      </Suspense>
    </div>
  )
}