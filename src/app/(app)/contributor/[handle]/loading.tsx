import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { SkeletonGrid } from '@/components/marketplace/SkeletonGrid';

export default function ContributorLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-32 mb-6" />

      {/* Contributor Header Skeleton */}
      <Card className="p-8 mb-8">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4 flex-1">
            {/* Avatar */}
            <Skeleton className="w-20 h-20 rounded-full" />
            
            {/* Name & Handle */}
            <div className="flex-1">
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-6 pt-6 border-t">
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Note */}
        <Skeleton className="h-3 w-64 mt-2" />
      </Card>

      {/* Assets Header */}
      <Skeleton className="h-8 w-40 mb-6" />

      {/* Assets Grid */}
      <SkeletonGrid count={8} />
    </div>
  );
}
