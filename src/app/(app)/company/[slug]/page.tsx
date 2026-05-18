import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { fetchOrgBySlug, fetchOrgAssets } from '@/lib/marketplace/company';
import { CompanyHeader } from '@/components/marketplace/CompanyHeader';
import { AssetCard } from '@/components/marketplace/AssetCard';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const orgData = await fetchOrgBySlug(slug);

  if (!orgData) {
    return {
      title: 'Company Not Found',
    };
  }

  return {
    title: `${orgData.org.display_name} - Company Profile`,
    description: orgData.org.bio || `${orgData.org.display_name} on the marketplace`,
  };
}

export default async function CompanyPage({ params }: { params: Params }) {
  const { slug } = await params;
  
  const startTime = performance.now();
  
  // Fetch org data and assets in parallel
  const [orgData, assets] = await Promise.all([
    fetchOrgBySlug(slug),
    fetchOrgAssets(slug),
  ]);

  const duration = performance.now() - startTime;

  if (!orgData) {
    notFound();
  }

  console.log(`[company/${slug}] SSR rendered ${assets.length} assets in ${duration.toFixed(0)}ms`);

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

      {/* Company Header */}
      <CompanyHeader org={orgData.org} stats={orgData.stats} />

      {/* Assets Grid */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Assets</h2>
        {assets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {assets.map(asset => (
              <AssetCard key={asset.external_id} asset={asset} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-muted rounded-lg">
            <p className="text-muted-foreground">
              No assets found for this company
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
