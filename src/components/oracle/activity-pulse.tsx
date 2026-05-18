'use client'

import { useOracleActivity } from '@/hooks/use-oracle-stream'

/**
 * Live activity indicator for Oracle dashboard.
 * Shows a pulsing dot + "Live" indicator.
 * Polls /api/oracle/stats every 30s and shows deltas.
 */
export function ActivityPulse() {
  const { delta, isLive, lastUpdated } = useOracleActivity(30_000)

  const hasDelta = delta.agents > 0 || delta.wallets > 0 || delta.transactions > 0
  const parts: string[] = []
  if (delta.agents > 0) parts.push(`+${delta.agents} agent${delta.agents > 1 ? 's' : ''}`)
  if (delta.wallets > 0) parts.push(`+${delta.wallets} wallet${delta.wallets > 1 ? 's' : ''}`)
  if (delta.transactions > 0) parts.push(`+${delta.transactions} tx`)

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Activity
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="relative inline-flex">
            {isLive && <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400/40 animate-ping" />}
            <span className={`relative inline-block w-2.5 h-2.5 rounded-full ${isLive ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          </span>
          <span
            className={`text-[10px] font-medium ${
              isLive ? 'text-emerald-400' : 'text-zinc-600'
            }`}
          >
            {isLive ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {hasDelta ? (
        <div className="space-y-1">
          {parts.map((part) => (
            <div
              key={part}
              className="text-xs font-mono text-emerald-400/80"
            >
              {part}
            </div>
          ))}
          <div className="text-[10px] text-zinc-600 mt-2">
            since page load
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-600">
          {isLive ? 'Monitoring for changes...' : 'Waiting for connection...'}
        </div>
      )}

      {lastUpdated && (
        <div className="text-[10px] text-zinc-700 mt-2 font-mono">
          Last poll: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
