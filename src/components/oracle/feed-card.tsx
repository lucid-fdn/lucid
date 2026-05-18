'use client'

import type { Feed } from '@/lib/oracle/api'

const FEED_ICONS: Record<string, string> = {
  aegdp: '$',
  aai: '⚡',
  apri: '🛡',
}

const FEED_COLORS: Record<string, string> = {
  aegdp: 'text-emerald-400',
  aai: 'text-blue-400',
  apri: 'text-amber-400',
}

function formatValue(feed: Feed): string {
  if (!feed.latest_value) return '—'
  try {
    const parsed = JSON.parse(feed.latest_value.value)
    if (feed.id === 'aegdp') return `$${(parsed.value_usd ?? 0).toLocaleString()}`
    if (feed.id === 'aai') return `${(parsed.value ?? 0).toFixed(1)}`
    if (feed.id === 'apri') return `${(parsed.value ?? 0).toFixed(0)}`
    return JSON.stringify(parsed)
  } catch {
    return feed.latest_value.value
  }
}

function formatStaleness(risk: string): { label: string; color: string } {
  switch (risk) {
    case 'low': return { label: 'Fresh', color: 'text-emerald-400' }
    case 'medium': return { label: 'Stale', color: 'text-amber-400' }
    case 'high': return { label: 'Critical', color: 'text-red-400' }
    default: return { label: risk, color: 'text-zinc-400' }
  }
}

export function FeedCard({ feed }: { feed: Feed }) {
  const value = formatValue(feed)
  const staleness = feed.latest_value
    ? formatStaleness(feed.latest_value.staleness_risk)
    : null

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{FEED_ICONS[feed.id] ?? '📊'}</span>
          <div>
            <h3 className="font-semibold text-zinc-100">{feed.name}</h3>
            <p className="text-xs text-zinc-500 font-mono">{feed.id} v{feed.version}</p>
          </div>
        </div>
        {staleness && (
          <span className={`text-xs font-medium ${staleness.color}`}>
            {staleness.label}
          </span>
        )}
      </div>

      <div className="mb-4">
        <span className={`text-3xl font-bold font-mono ${FEED_COLORS[feed.id] ?? 'text-zinc-100'}`}>
          {value}
        </span>
      </div>

      {feed.latest_value && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-zinc-500">Confidence</span>
            <div className="mt-1">
              <div className="h-1.5 w-full rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500/80"
                  style={{ width: `${(feed.latest_value.confidence * 100).toFixed(0)}%` }}
                />
              </div>
              <span className="text-zinc-400 mt-0.5 block">
                {(feed.latest_value.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div>
            <span className="text-zinc-500">Updated</span>
            <p className="text-zinc-400 mt-1 font-mono">
              {new Date(feed.latest_value.computed_at).toLocaleTimeString()}
            </p>
          </div>
        </div>
      )}

      {!feed.latest_value && (
        <p className="text-sm text-zinc-600">No data yet — waiting for first computation</p>
      )}

      <p className="mt-4 text-xs text-zinc-600 line-clamp-2">{feed.description}</p>
    </div>
  )
}
