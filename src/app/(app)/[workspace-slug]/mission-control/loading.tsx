/**
 * Mission Control — Loading Skeleton
 */

export default function MissionControlLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] animate-pulse">
      {/* Left: Agent list skeleton */}
      <div className="w-72 border-r border-border p-4 space-y-3">
        <div className="h-6 bg-muted rounded w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="h-3 w-3 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-24" />
              <div className="h-3 bg-muted rounded w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* Center: Live feed skeleton */}
      <div className="flex-1 p-4 space-y-3">
        <div className="h-6 bg-muted rounded w-24" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <div className="h-4 w-4 rounded bg-muted mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-48" />
              <div className="h-3 bg-muted rounded w-64" />
            </div>
            <div className="h-3 bg-muted rounded w-16" />
          </div>
        ))}
      </div>

      {/* Right: Context panel skeleton */}
      <div className="w-80 border-l border-border p-4 space-y-4">
        <div className="h-6 bg-muted rounded w-28" />
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
        <div className="h-px bg-muted" />
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-20" />
          <div className="h-16 bg-muted rounded" />
        </div>
      </div>
    </div>
  )
}
