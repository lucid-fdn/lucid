import { AssetSection } from '@/components/marketplace/asset-section';
import { ConnectorGrid } from '@/components/marketplace/connector-grid';
import {
  CURATED_SECTIONS,
  SECTION_METADATA,
  TEXT_GENERATION_MODELS,
  IMAGE_GENERATION_MODELS,
  VIDEO_GENERATION_MODELS,
  VOICE_AUDIO_MODELS,
  TRADING_AI_MODELS,
  RECOMMENDED_MODELS,
} from '@/lib/marketplace/curated-content';
import { getAssets } from '@/lib/marketplace/marketplace-service';
import type { AssetKind } from '@/lib/marketplace/types';
import { cn } from '@/lib/utils';

/**
 * Explore Sections Component
 * 
 * Apple TV+ style discovery interface with:
 * - Hero banner (featured content)
 * - Horizontal scrolling sections
 * - Curated content collections
 * 
 * This is the DEFAULT view when no filters/search are active
 */
export async function ExploreSections({ className, isAuthenticated = true }: { className?: string; isAuthenticated?: boolean }) {
  // Fetch remaining sections in parallel
  const [
    popularModelsData,
    topConnectorsData,
    featuredDatasetsData,
    _newThisWeekData,
    _trendingNowData
  ] = await Promise.all([
    // Popular Models - dynamic (fetch from API)
    getAssets({ 
      kind: 'MODEL',
      limit: CURATED_SECTIONS.popularModels.limit 
    }),
    // Top Connectors - curated IDs
    getAssets({
      ids: CURATED_SECTIONS.topConnectors.ids,
      kind: 'CONNECTOR' as unknown as AssetKind, // Required for static connector lookup
      limit: CURATED_SECTIONS.topConnectors.limit
    }),
    // Featured Datasets - curated IDs
    getAssets({ 
      ids: CURATED_SECTIONS.featuredDatasets.ids,
      kind: 'DATASET',
      limit: CURATED_SECTIONS.featuredDatasets.limit 
    }),
    // New This Week - dynamic, sorted by creation date ('recent' maps to created_at)
    getAssets({ 
      sort: 'recent',
      limit: CURATED_SECTIONS.newThisWeek.limit 
    }),
    // Trending Now - dynamic, sorted by downloads ('runs' is best proxy for popularity)
    getAssets({ 
      sort: 'runs',
      limit: CURATED_SECTIONS.trendingNow.limit 
    })
  ]);

  // Hero asset reserved for future use when hero section is re-enabled
  const _heroAsset = popularModelsData.assets[0];

  return (
    <div className={cn("space-y-12", className)}>
      {/* Hero Banner - Featured Content
      {heroAsset && (
        <HeroBanner 
          asset={heroAsset}
          tagline={CURATED_SECTIONS.hero.tagline}
          subtitle={CURATED_SECTIONS.hero.subtitle}
        />
      )} */}

      {/* Featured - Best Models from Each Category */}
      <AssetSection
        title="Featured"
        description="Best models across all categories - Trading, Text, Image, Video, Voice"
        assets={RECOMMENDED_MODELS}
        isAuthenticated={isAuthenticated}
      />
      {/* Top Connectors Section - Compact icons with carousel */}
      <ConnectorGrid
        title={SECTION_METADATA.topConnectors.title}
        description={SECTION_METADATA.topConnectors.description}
        connectors={topConnectorsData.assets}
        viewAllHref={SECTION_METADATA.topConnectors.viewAllHref}
      />
      {/* Trading & Finance AI Section - NEW */}
      <AssetSection
        title={SECTION_METADATA.tradingAI.title}
        description={SECTION_METADATA.tradingAI.description}
        assets={TRADING_AI_MODELS}
        viewAllHref={SECTION_METADATA.tradingAI.viewAllHref}
        isAuthenticated={isAuthenticated}
      />

      {/* Video Generation Models Section - NEW */}
      <AssetSection
        title={SECTION_METADATA.videoGeneration.title}
        description={SECTION_METADATA.videoGeneration.description}
        assets={VIDEO_GENERATION_MODELS}
        viewAllHref={SECTION_METADATA.videoGeneration.viewAllHref}
        isAuthenticated={isAuthenticated}
      />
      
      {/* Text Generation Models Section - NEW */}
      <AssetSection
        title={SECTION_METADATA.textGeneration.title}
        description={SECTION_METADATA.textGeneration.description}
        assets={TEXT_GENERATION_MODELS}
        viewAllHref={SECTION_METADATA.textGeneration.viewAllHref}
        isAuthenticated={isAuthenticated}
      />

      {/* Image Generation Models Section - NEW */}
      <AssetSection
        title={SECTION_METADATA.imageGeneration.title}
        description={SECTION_METADATA.imageGeneration.description}
        assets={IMAGE_GENERATION_MODELS}
        viewAllHref={SECTION_METADATA.imageGeneration.viewAllHref}
        isAuthenticated={isAuthenticated}
      />

      {/* Voice & Audio Models Section - NEW */}
      <AssetSection
        title={SECTION_METADATA.voiceAudio.title}
        description={SECTION_METADATA.voiceAudio.description}
        assets={VOICE_AUDIO_MODELS}
        viewAllHref={SECTION_METADATA.voiceAudio.viewAllHref}
        isAuthenticated={isAuthenticated}
      />

      {/* Training Datasets Section - NEW */}
      <AssetSection
        title={SECTION_METADATA.datasets.title}
        description={SECTION_METADATA.datasets.description}
        assets={featuredDatasetsData.assets}
        viewAllHref={SECTION_METADATA.datasets.viewAllHref}
        isAuthenticated={isAuthenticated}
      />

      {/* Recommended for You Section - Personalized
      <AssetSection
        title={SECTION_METADATA.recommendedForYou.title}
        description={SECTION_METADATA.recommendedForYou.description}
        assets={recommendedData.assets}
      /> */}
    </div>
  );
}
