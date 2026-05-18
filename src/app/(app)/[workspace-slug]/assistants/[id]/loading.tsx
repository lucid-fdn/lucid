import { Skeleton } from '@/components/ui/skeleton'

export default function AssistantDetailLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      {/* Hero layout — matches the current agent detail page */}
      <div className="flex-1 min-h-0 relative">
        {/* Hero section: pulse dot + identity */}
        <div className="flex items-center gap-5 pt-10 pb-4 px-14 max-w-[860px]">
          {/* Pulse dot placeholder */}
          <div className="shrink-0" style={{ width: 160, height: 160 }}>
            <Skeleton className="w-full h-full rounded-full opacity-30" />
          </div>

          {/* Identity stack */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Agent name */}
            <Skeleton className="h-12 w-72" />
            {/* Status line: dot + live status */}
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-4 w-48" />
            </div>
            {/* Mission text */}
            <Skeleton className="h-4 w-64" />
            {/* Metadata chips */}
            <Skeleton className="h-3 w-40 opacity-50" />
            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Skeleton className="h-10 w-24 rounded-lg" />
              <Skeleton className="h-10 w-28 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Presence line: dot + "Listening on..." + waveform */}
        <div className="flex items-center gap-3 px-14 py-3 max-w-[860px]">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3 w-1 rounded-full opacity-30" />
          <Skeleton className="h-3.5 w-28" />
          <div className="ml-auto flex items-end gap-[2px]">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="rounded-full opacity-20"
                style={{ width: 1.5, height: 4 + (i % 3) * 4 }}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-14 max-w-[832px]">
          <Skeleton className="h-px w-full opacity-20" />
        </div>

        {/* Summary rows */}
        <div className="px-14 py-4 max-w-[860px] space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0"
            >
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3.5 w-20" />
              <div className="flex-1" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-3.5 rounded opacity-30" />
            </div>
          ))}
        </div>

        {/* Ambient ghost activity zone (right side — subtle gradient placeholder) */}
        <div
          className="absolute inset-y-0 right-0 w-[480px] pointer-events-none hidden lg:block"
          style={{
            background: 'linear-gradient(to right, transparent 0%, transparent 40%, var(--muted) 100%)',
            opacity: 0.15,
          }}
        />
      </div>
    </div>
  )
}
