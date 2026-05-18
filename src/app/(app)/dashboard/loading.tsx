export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <div className="h-9 w-48 rounded-md bg-muted animate-pulse" />
        <div className="mt-2 h-5 w-72 rounded-md bg-muted animate-pulse" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6">
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="mt-3 h-7 w-16 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 rounded-lg border bg-muted/40 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
