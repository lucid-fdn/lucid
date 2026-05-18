import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { FEATURES } from '@/lib/features';
import { SearchFilters, UiAsset, AssetKind } from '@/lib/marketplace/types';
import { SkeletonGrid } from '@/components/marketplace/SkeletonGrid';
import { SearchControls } from '@/components/marketplace/search-controls';
import { AssetGrid } from '@/components/marketplace/asset-grid';
import { ExploreSections } from '@/app/(app)/explore/explore-sections';
import { getAssets } from '@/lib/marketplace/marketplace-service';
import { NetflixHero } from '@/components/hero/netflix-hero';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public Browse Page (Marketing)
 * 
 * Industry Standard Pattern (Netflix/Spotify/GitHub):
 * - Public users: Browse marketplace without login
 * - Authenticated users: Can still browse, or redirect to /explore for personalized experience
 * 
 * URL: /browse (public marketplace)
 * vs
 * URL: /explore (authenticated, personalized)
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Feature flag check
  if (!FEATURES.marketplace) {
    redirect('/');
  }

  // Optional: Redirect authenticated users to personalized explore
  // Uncomment if you want logged-in users to see /explore instead
  /*
  const cookieStore = await cookies();
  const token = cookieStore.get('privy-token')?.value || 
                cookieStore.get('privy-id-token')?.value ||
                cookieStore.get('privy-refresh-token')?.value;
  
  if (token) {
    redirect('/explore'); // Personalized version
  }
  */

  const params = await searchParams;
  
  // Check if user has active filters/search
  const hasFilters = Boolean(
    params.q || 
    params.kind || 
    params.tags ||
    params.sort ||
    params.p95_lte ||
    params.price_lte ||
    params.eu_only ||
    params.cc_on
  );
  
  // MODE 1: Discovery (Netflix-style with hero + sections)
  // Show when no filters are active
  if (!hasFilters) {
    return (
      <>
        {/* Netflix-Style Hero */}
        <NetflixHero
          title="Explore the Internet of AI"
          description="Discover cutting-edge AI models, datasets, integrations, and compute resources. Build faster with proven, production-ready assets."
          videoUrl="/videos/ioai.webm"
          posterUrl="/hero-poster.jpg"
        />

        {/* Sections - Same as explore page but without auth features */}
        <div className="w-full mx-auto py-8 -mr-4 p-4" id="sections">
          <Suspense fallback={<SkeletonGrid count={12} />}>
            <ExploreSections isAuthenticated={false} />
          </Suspense>
        </div>
      </>
    );
  }
  
  // MODE 2: Search/Filter (Unified grid)
  // Show when user has applied filters or search
  
  // Build filters from URL params
  const filters: SearchFilters = {
    q: typeof params.q === 'string' ? params.q : undefined,
    kind: typeof params.kind === 'string' ? params.kind as AssetKind : undefined,
    tags: typeof params.tags === 'string' ? params.tags.split(',') : undefined,
    sort: typeof params.sort === 'string' ? params.sort as SearchFilters['sort'] : 'relevance',
    p95_lte: typeof params.p95_lte === 'string' ? parseInt(params.p95_lte, 10) : undefined,
    price_lte: typeof params.price_lte === 'string' ? parseFloat(params.price_lte) : undefined,
    eu_only: params.eu_only === 'true',
    cc_on: params.cc_on === 'true',
    cursor: typeof params.cursor === 'string' ? params.cursor : undefined,
    limit: 24,
  };

  // Use centralized MarketplaceService
  const { assets: rawAssets, total: _total } = await getAssets(filters);
  const assets = rawAssets as unknown as UiAsset[];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Browse Marketplace</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Discover verified AI models, datasets, agents, and compute resources
        </p>
      </div>

      <SearchControls initialFilters={filters} />

      <div className="mt-6">
        {assets.length > 0 ? (
          <AssetGrid 
            initialAssets={assets}
            initialCursor={undefined}
            initialFilters={filters}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              No assets found. Try adjusting your filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
