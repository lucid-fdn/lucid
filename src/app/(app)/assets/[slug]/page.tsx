import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { fetchAssetDetail } from '@/lib/marketplace/asset-detail';
import { AssetHeader } from '@/components/marketplace/AssetHeader';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const asset = await fetchAssetDetail(slug);

  if (!asset) {
    return {
      title: 'Asset Not Found',
    };
  }

  return {
    title: `${asset.name} ${asset.version} - ${asset.kind}`,
    description: asset.summary || `${asset.name} - AI ${asset.kind.toLowerCase()} on the marketplace`,
  };
}

export default async function AssetDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  
  const startTime = performance.now();
  const asset = await fetchAssetDetail(slug);
  const duration = performance.now() - startTime;

  if (!asset) {
    notFound();
  }

  console.log(`[assets/${slug}] SSR rendered in ${duration.toFixed(0)}ms`);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl p-4">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link 
          href="/explore"
          className="text-sm text-primary hover:underline"
        >
          ← Back to Explore
        </Link>
      </div>

      {/* Asset Header */}
      <AssetHeader asset={asset} />

      {/* Action Buttons */}
      <div className="flex gap-3 mb-8">
        <Link href={`/playground?asset=${asset.slug}`} className="flex-1">
          <Button variant="default" className="w-full" size="lg">
            Try in Playground
          </Button>
        </Link>
        <Button variant="outline" size="lg">
          Add to Project
        </Button>
      </div>

      {/* Description Section (if needed) */}
      <div className="prose dark:prose-invert max-w-none">
        <h2>About this {asset.kind.toLowerCase()}</h2>
        <p>
          {asset.summary || `${asset.name} is a ${asset.kind.toLowerCase()} available on the marketplace.`}
        </p>

        {asset.license && (
          <>
            <h3>License</h3>
            <p>This asset is available under the <strong>{asset.license}</strong> license.</p>
          </>
        )}

        {asset.tags && asset.tags.length > 0 && (
          <>
            <h3>Use Cases</h3>
            <p>
              This asset is optimized for: {asset.tags.join(', ')}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
