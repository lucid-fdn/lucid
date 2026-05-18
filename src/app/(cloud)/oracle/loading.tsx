export default function OracleLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-zinc-800/50" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="h-6 w-40 animate-pulse rounded bg-zinc-800 mb-4" />
            <div className="h-10 w-24 animate-pulse rounded bg-zinc-800 mb-4" />
            <div className="h-3 w-full animate-pulse rounded bg-zinc-800/50" />
          </div>
        ))}
      </div>
    </div>
  )
}
