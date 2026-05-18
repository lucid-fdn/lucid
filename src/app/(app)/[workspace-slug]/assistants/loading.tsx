import { Skeleton } from '@/components/ui/skeleton'

export default function AssistantsLoading() {
  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56 mt-2" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-72 rounded-md" />
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <div className="flex gap-1.5 pt-1">
              <Skeleton className="h-5 w-14 rounded-md" />
              <Skeleton className="h-5 w-14 rounded-md" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div className="flex gap-1">
                <Skeleton className="h-5 w-20 rounded" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
