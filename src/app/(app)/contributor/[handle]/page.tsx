import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { fetchContributorByHandle, fetchContributorAssets } from '@/lib/marketplace/contributor';
import { ContributorHeader } from '@/components/marketplace/ContributorHeader';
import { AssetCard } from '@/components/marketplace/AssetCard';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

type Params = Promise<{ handle: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle } = await params;
  const contributor = await fetchContributorByHandle(handle);

  if (!contributor) {
    return {
      title: 'Contributor Not Found',
    };
  }

  return {
    title: `${contributor.name || `@${contributor.handle}`} - Contributor Profile`,
    description: contributor.bio || `${contributor.name || contributor.handle} on the marketplace`,
  };
}

export default async function ContributorPage({ params }: { params: Params }) {
  const { handle } = await params;
  
  const startTime = performance.now();
  
  // Fetch contributor data and assets in parallel
  const [contributor, assets] = await Promise.all([
    fetchContributorByHandle(handle),
    fetchContributorAssets(handle),
  ]);

  const duration = performance.now() - startTime;

  if (!contributor) {
    notFound();
  }

  console.log(`[contributor/${handle}] SSR rendered ${assets.length} personal assets in ${duration.toFixed(0)}ms`);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl p-4">
      {/* Top Bar: Back button + Notification Bell */}
      <div className="flex justify-between items-center mb-6">
        <Link 
          href="/explore"
          className="text-sm text-primary hover:underline"
        >
          ← Back to Explore
        </Link>
        <NotificationBell />
      </div>

      {/* Contributor Header */}
      <ContributorHeader contributor={contributor} assetCount={assets.length} />

      {/* Assets Grid */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Personal Assets</h2>
        {assets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {assets.map(asset => (
              <AssetCard key={asset.external_id} asset={asset} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-muted rounded-lg">
            <p className="text-muted-foreground">
              No personal assets found for this contributor
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
