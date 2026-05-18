import { Skeleton } from '@/components/ui/skeleton'

export default function AgentDetailLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      {/* Hero skeleton */}
      <div className="relative -mx-4 -mt-8 bg-white/[0.02] px-4 pb-6 pt-8">
        <div className="mx-auto max-w-7xl">
          <Skeleton className="mb-4 h-5 w-32 bg-white/[0.06]" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-xl bg-white/[0.06]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-7 w-48 bg-white/[0.06]" />
              <Skeleton className="h-4 w-96 bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </div>

      {/* Market stats skeleton */}
      <div className="mx-auto mt-4 max-w-7xl">
        <div className="flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-14 min-w-[100px] flex-1 rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      </div>

      {/* Tab skeleton */}
      <div className="mx-auto mt-6 max-w-7xl">
        <div className="flex gap-4 border-b border-white/[0.06] pb-2">
          <Skeleton className="h-5 w-32 bg-white/[0.06]" />
          <Skeleton className="h-5 w-24 bg-white/[0.04]" />
          <Skeleton className="h-5 w-28 bg-white/[0.04]" />
        </div>

        {/* Content skeleton */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-[400px] rounded-xl bg-white/[0.04] lg:col-span-2" />
          <Skeleton className="h-[400px] rounded-xl bg-white/[0.04]" />
        </div>
      </div>
    </div>
  )
}
