export default function SettingsLoading() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="h-10 w-36 rounded-md bg-muted animate-pulse" />
        <div className="mt-2 h-5 w-64 rounded-md bg-muted animate-pulse" />
      </div>

      {/* Settings cards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6">
            <div className="flex items-start gap-4">
              <div className="h-6 w-6 rounded bg-muted animate-pulse" />
              <div className="flex-1">
                <div className="h-5 w-24 rounded bg-muted animate-pulse" />
                <div className="mt-2 h-4 w-full rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
