import { Skeleton } from '@/components/ui/skeleton'

export default function DiscoverLoading() {
  return (
    <div className="relative min-h-[80vh]">
      {/* Hero skeleton */}
      <div className="mb-12 rounded-3xl border border-white/[0.06] bg-white/[0.02] px-6 py-16 sm:px-12">
        <Skeleton className="h-12 w-80 bg-white/[0.06]" />
        <Skeleton className="mt-4 h-5 w-[480px] bg-white/[0.04]" />
        <div className="mt-8 flex gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-32 bg-white/[0.06]" />
          ))}
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full bg-white/[0.06]" />
          ))}
        </div>
        <Skeleton className="h-10 w-64 rounded-xl bg-white/[0.04]" />
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16 rounded-full bg-white/[0.06]" />
              <Skeleton className="h-4 w-10 bg-white/[0.06]" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-full bg-white/[0.06]" />
              <Skeleton className="h-5 w-32 bg-white/[0.06]" />
            </div>
            <Skeleton className="mt-3 h-10 w-full bg-white/[0.04]" />
            <div className="mt-4 flex gap-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-10 flex-1 rounded-lg bg-white/[0.04]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
