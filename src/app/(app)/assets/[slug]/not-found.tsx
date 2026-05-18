import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AssetNotFound() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <Card className="p-12 text-center">
        <div className="mb-4 text-6xl">🔍</div>
        <h1 className="text-3xl font-bold mb-2">Asset Not Found</h1>
        <p className="text-muted-foreground mb-6">
          The asset you're looking for doesn't exist or has been removed.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/explore">
            <Button variant="default">
              Browse Marketplace
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline">
              Go Home
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
