import { Skeleton } from '@/components/ui/skeleton'

export default function PortfolioLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-10">
        <Skeleton className="h-9 w-48 bg-white/[0.06]" />
        <Skeleton className="mt-1.5 h-4 w-64 bg-white/[0.04]" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20 bg-white/[0.04]" />
                <Skeleton className="h-7 w-24 bg-white/[0.06]" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>

      {/* Agent list */}
      <div className="mt-8 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24 bg-white/[0.04]" />
          <Skeleton className="h-7 w-24 rounded-lg bg-white/[0.04]" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
            <Skeleton className="h-11 w-11 rounded-lg bg-white/[0.06]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40 bg-white/[0.06]" />
              <Skeleton className="h-3 w-64 bg-white/[0.04]" />
            </div>
            <div className="hidden gap-8 md:flex">
              <Skeleton className="h-4 w-16 bg-white/[0.04]" />
              <Skeleton className="h-4 w-16 bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
