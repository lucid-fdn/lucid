'use client'

import { formatUsd, formatCompact } from '@/lib/oracle/format'

interface AgentChartProps {
  txCount24h: number
  txCount7d: number
  volume24h: number
  volume7d: number
  firstSeen: string | null
  lastActive: string | null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '--'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function MetricCard({
  label,
  primary,
  secondary,
  accent,
}: {
  label: string
  primary: string
  secondary?: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-lg font-bold font-mono mt-1 ${accent ?? 'text-zinc-100'}`}>
        {primary}
      </div>
      {secondary && (
        <div className="text-[10px] text-zinc-600 mt-0.5">{secondary}</div>
      )}
    </div>
  )
}

/**
 * Agent activity summary with key metrics.
 * Simple card layout -- no chart library dependency (Phase A).
 */
export function AgentChart({
  txCount24h,
  txCount7d,
  volume24h,
  volume7d,
  firstSeen,
  lastActive,
}: AgentChartProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
        Activity Summary
      </h3>

      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Transactions (24h)"
          primary={formatCompact(txCount24h)}
          secondary={`${formatCompact(txCount7d)} (7d)`}
          accent="text-blue-400"
        />
        <MetricCard
          label="Volume (24h)"
          primary={formatUsd(volume24h)}
          secondary={`${formatUsd(volume7d)} (7d)`}
          accent="text-emerald-400"
        />
        <MetricCard
          label="First Seen"
          primary={firstSeen ? new Date(firstSeen).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'}
        />
        <MetricCard
          label="Last Active"
          primary={timeAgo(lastActive)}
          accent={lastActive && (Date.now() - new Date(lastActive).getTime()) < 86_400_000 ? 'text-emerald-400' : 'text-zinc-400'}
        />
      </div>

      {/* Simple bar comparison: 24h vs 7d tx */}
      {txCount7d > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
            <span>24h / 7d ratio</span>
            <span className="font-mono">
              {((txCount24h / txCount7d) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500/60 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (txCount24h / txCount7d) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
