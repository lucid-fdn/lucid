import { Skeleton } from '@/components/ui/skeleton'

export default function LeaderboardLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl bg-white/[0.06]" />
          <Skeleton className="h-9 w-48 bg-white/[0.06]" />
        </div>
        <Skeleton className="ml-[52px] mt-2 h-4 w-64 bg-white/[0.04]" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <Skeleton className="h-9 w-9 rounded-lg bg-white/[0.06]" />
              <Skeleton className="h-3 w-24 bg-white/[0.04]" />
            </div>
            <Skeleton className="h-8 w-28 bg-white/[0.06]" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex gap-8">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16 bg-white/[0.06]" />
            ))}
          </div>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-white/[0.03] px-5 py-3.5">
            <Skeleton className="h-8 w-8 rounded-full bg-white/[0.06]" />
            <Skeleton className="h-9 w-9 rounded-lg bg-white/[0.06]" />
            <Skeleton className="h-5 w-32 bg-white/[0.06]" />
            <div className="ml-auto flex gap-8">
              <Skeleton className="h-4 w-16 bg-white/[0.04]" />
              <Skeleton className="h-4 w-16 bg-white/[0.04]" />
              <Skeleton className="h-4 w-12 bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
