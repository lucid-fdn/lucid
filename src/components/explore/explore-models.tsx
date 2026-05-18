import { Suspense } from 'react'
import { SkeletonGrid } from '@/components/marketplace/SkeletonGrid'
import { CategoryNav } from './category-nav'
import { SearchControls } from '@/components/marketplace/search-controls'
import { AssetGrid } from '@/components/marketplace/asset-grid'
import { AssetSection } from '@/components/marketplace/asset-section'
import { getAssets } from '@/lib/marketplace/marketplace-service'
import {
  TEXT_GENERATION_MODELS,
  IMAGE_GENERATION_MODELS,
  VIDEO_GENERATION_MODELS,
  VOICE_AUDIO_MODELS,
  TRADING_AI_MODELS,
  RECOMMENDED_MODELS,
  SECTION_METADATA,
} from '@/lib/marketplace/curated-content'
import type { SearchFilters, UiAsset } from '@/lib/marketplace/types'
import type { ExplorePageProps } from './types'

/**
 * Shared Models page component
 * Used by both marketing and workspace routes
 */
export async function ExploreModels({
  isAuthenticated,
  basePath,
  params,
}: ExplorePageProps) {
  const hasSearch = Boolean(params.q || params.sort || params.tags)

  if (hasSearch) {
    const filters: SearchFilters = {
      q: typeof params.q === 'string' ? params.q : undefined,
      kind: 'MODEL',
      tags: typeof params.tags === 'string' ? params.tags.split(',') : undefined,
      sort: typeof params.sort === 'string' ? (params.sort as SearchFilters['sort']) : 'runs',
      limit: 24,
    }

    const { assets: rawAssets } = await getAssets(filters)
    const assets = rawAssets as unknown as UiAsset[]

    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
            <p className="text-sm text-muted-foreground">
              100+ AI models — chat, image, video, audio, code & more
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
                No models found matching your criteria
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

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
          <p className="text-sm text-muted-foreground">
            100+ AI models — chat, image, video, audio, code & more
          </p>
        </div>
        <CategoryNav basePath={basePath} />
      </div>

      <Suspense fallback={<SkeletonGrid count={12} />}>
        <div className="space-y-12">
          <AssetSection
            title="Featured"
            description="Best models across all categories"
            assets={RECOMMENDED_MODELS}
            isAuthenticated={isAuthenticated}
          />
          <AssetSection
            title={SECTION_METADATA.textGeneration.title}
            description={SECTION_METADATA.textGeneration.description}
            assets={TEXT_GENERATION_MODELS}
            viewAllHref={SECTION_METADATA.textGeneration.viewAllHref}
            isAuthenticated={isAuthenticated}
          />
          <AssetSection
            title={SECTION_METADATA.imageGeneration.title}
            description={SECTION_METADATA.imageGeneration.description}
            assets={IMAGE_GENERATION_MODELS}
            viewAllHref={SECTION_METADATA.imageGeneration.viewAllHref}
            isAuthenticated={isAuthenticated}
          />
          <AssetSection
            title={SECTION_METADATA.videoGeneration.title}
            description={SECTION_METADATA.videoGeneration.description}
            assets={VIDEO_GENERATION_MODELS}
            viewAllHref={SECTION_METADATA.videoGeneration.viewAllHref}
            isAuthenticated={isAuthenticated}
          />
          <AssetSection
            title={SECTION_METADATA.voiceAudio.title}
            description={SECTION_METADATA.voiceAudio.description}
            assets={VOICE_AUDIO_MODELS}
            viewAllHref={SECTION_METADATA.voiceAudio.viewAllHref}
            isAuthenticated={isAuthenticated}
          />
          <AssetSection
            title={SECTION_METADATA.tradingAI.title}
            description={SECTION_METADATA.tradingAI.description}
            assets={TRADING_AI_MODELS}
            viewAllHref={SECTION_METADATA.tradingAI.viewAllHref}
            isAuthenticated={isAuthenticated}
          />
        </div>
      </Suspense>
    </div>
  )
}