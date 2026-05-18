export default function AgentsLoading() {
  return (
    <div className="flex-1 px-6 py-6">
      {/* Header row */}
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-56 rounded-md bg-muted animate-pulse" />
        <div className="h-9 w-20 rounded-md bg-muted animate-pulse" />
      </div>

      {/* Featured banner */}
      <div className="mb-8 h-[300px] rounded-2xl bg-muted animate-pulse" />

      {/* Tabs */}
      <div className="mb-8 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-md bg-muted animate-pulse" />
        ))}
      </div>

      {/* Agent cards grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border">
            <div className="h-40 bg-muted animate-pulse" />
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="h-5 w-28 rounded bg-muted animate-pulse" />
                <div className="h-4 w-10 rounded bg-muted animate-pulse" />
              </div>
              <div className="mb-4 h-4 w-full rounded bg-muted animate-pulse" />
              <div className="flex items-center justify-between">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="h-8 w-20 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
