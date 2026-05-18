import { SkeletonGrid } from '@/components/marketplace/SkeletonGrid';
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function ExploreLoading() {
  return (
    <div className="container mx-auto py-8">
      {/* Header Skeleton */}
      <div className="mb-8">
        <Skeleton className="h-8 w-1/3 mb-2" />
        <Skeleton className="h-5 w-2/3" />
      </div>

      {/* Search Controls Skeleton */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <Skeleton className="flex-1 h-10" />
          <Skeleton className="w-32 h-10" />
          <Skeleton className="w-32 h-10" />
        </div>
      </Card>

      {/* Grid Skeleton */}
      <SkeletonGrid count={12} />
    </div>
  );
}
