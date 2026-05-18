import { getFeed, getFeedMethodology } from '@/lib/oracle/api'
import { notFound } from 'next/navigation'

export default async function FeedDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    const [feedData, methodology] = await Promise.all([
      getFeed(id),
      getFeedMethodology(id),
    ])

    const { feed, latest } = feedData

    let parsedValue: Record<string, unknown> | null = null
    if (latest) {
      try { parsedValue = JSON.parse(latest.value) } catch {}
    }

    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">{feed.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">{feed.description}</p>
          <p className="mt-1 text-xs text-zinc-600 font-mono">{feed.id} v{feed.version}</p>
        </div>

        {latest && parsedValue && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
            <h2 className="text-sm font-medium text-zinc-500 mb-3">Current Value</h2>
            <pre className="text-sm text-zinc-300 font-mono bg-zinc-900 rounded-lg p-4 overflow-x-auto">
              {JSON.stringify(parsedValue, null, 2)}
            </pre>
            <div className="grid grid-cols-4 gap-4 mt-4 text-xs">
              <div>
                <span className="text-zinc-500">Confidence</span>
                <p className="text-zinc-200 font-mono">{(latest.confidence * 100).toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-zinc-500">Freshness</span>
                <p className="text-zinc-200 font-mono">{latest.freshness_ms}ms</p>
              </div>
              <div>
                <span className="text-zinc-500">Staleness</span>
                <p className="text-zinc-200 font-mono">{latest.staleness_risk}</p>
              </div>
              <div>
                <span className="text-zinc-500">Computed</span>
                <p className="text-zinc-200 font-mono">{new Date(latest.computed_at).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-sm font-medium text-zinc-500 mb-3">Methodology</h2>
          <pre className="text-xs text-zinc-400 font-mono bg-zinc-900 rounded-lg p-4 overflow-x-auto">
            {JSON.stringify(methodology, null, 2)}
          </pre>
        </div>
      </div>
    )
  } catch {
    notFound()
  }
}
