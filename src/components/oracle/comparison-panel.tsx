'use client'

import type { AgentDetail } from '@/lib/oracle/api'
import { formatUsd, formatCompact, getReputationColor } from '@/lib/oracle/format'
import { StatusIndicator } from '@/components/oracle/status-indicator'
import Link from 'next/link'

// ── Reputation gauge ─────────────────────────────────────────

function ReputationGauge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">--</span>

  const pct = Math.min(100, Math.max(0, value))
  const { text: color, bg: barColor } = getReputationColor(pct)

  return (
    <div className="flex flex-col gap-1">
      <span className={`text-lg font-bold font-mono ${color}`}>
        {pct.toFixed(1)}%
      </span>
      <div className="w-full h-1 bg-accent rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Winner highlight ─────────────────────────────────────────

function getWinnerIndex(
  values: (number | null | undefined)[],
  higherIsBetter: boolean,
): number {
  let bestIdx = -1
  let bestVal: number | null = null

  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) continue
    if (
      bestVal == null ||
      (higherIsBetter ? v > bestVal : v < bestVal)
    ) {
      bestVal = v
      bestIdx = i
    }
  }

  // Only highlight if there are at least 2 non-null values
  const nonNull = values.filter((v) => v != null).length
  return nonNull >= 2 ? bestIdx : -1
}

// ── Main component ───────────────────────────────────────────

interface ComparisonPanelProps {
  agents: AgentDetail[]
}

interface MetricRow {
  label: string
  values: string[]
  rawValues: (number | null | undefined)[]
  higherIsBetter: boolean
}

export function ComparisonPanel({ agents }: ComparisonPanelProps) {
  // Build metric rows
  const metrics: MetricRow[] = [
    {
      label: 'Portfolio Value',
      values: agents.map((a) => formatUsd(a.balances?.total_usd)),
      rawValues: agents.map((a) => a.balances?.total_usd),
      higherIsBetter: true,
    },
    {
      label: 'Wallets',
      values: agents.map((a) => String(a.stats?.wallet_count ?? a.wallets?.length ?? 0)),
      rawValues: agents.map((a) => a.stats?.wallet_count ?? a.wallets?.length ?? 0),
      higherIsBetter: true,
    },
    {
      label: 'Transactions (24h)',
      values: agents.map((a) => formatCompact(a.transactions_summary?.count_24h)),
      rawValues: agents.map((a) => a.transactions_summary?.count_24h),
      higherIsBetter: true,
    },
    {
      label: 'Transactions (7d)',
      values: agents.map((a) => formatCompact(a.transactions_summary?.count_7d)),
      rawValues: agents.map((a) => a.transactions_summary?.count_7d),
      higherIsBetter: true,
    },
    {
      label: 'Volume (24h)',
      values: agents.map((a) => formatUsd(a.transactions_summary?.volume_usd_24h)),
      rawValues: agents.map((a) => a.transactions_summary?.volume_usd_24h),
      higherIsBetter: true,
    },
    {
      label: 'Volume (7d)',
      values: agents.map((a) => formatUsd(a.transactions_summary?.volume_usd_7d)),
      rawValues: agents.map((a) => a.transactions_summary?.volume_usd_7d),
      higherIsBetter: true,
    },
    {
      label: 'Gas Used (24h)',
      values: agents.map((a) => formatCompact(a.gas_used_24h)),
      rawValues: agents.map((a) => a.gas_used_24h),
      higherIsBetter: false,
    },
    {
      label: 'Services',
      values: agents.map((a) => {
        const meta = a.metadata_json ?? {}
        const services = Array.isArray(meta.services) ? meta.services : []
        return String(services.length)
      }),
      rawValues: agents.map((a) => {
        const meta = a.metadata_json ?? {}
        const services = Array.isArray(meta.services) ? meta.services : []
        return services.length
      }),
      higherIsBetter: true,
    },
    {
      label: 'Protocol Links',
      values: agents.map((a) => String(a.stats?.protocol_count ?? a.protocols?.length ?? 0)),
      rawValues: agents.map((a) => a.stats?.protocol_count ?? a.protocols?.length ?? 0),
      higherIsBetter: true,
    },
    {
      label: 'Agent Connections',
      values: agents.map((a) => String(a.agent_connections?.length ?? 0)),
      rawValues: agents.map((a) => a.agent_connections?.length ?? 0),
      higherIsBetter: true,
    },
    {
      label: 'Contracts Interacted',
      values: agents.map((a) => String(a.top_contracts?.length ?? 0)),
      rawValues: agents.map((a) => a.top_contracts?.length ?? 0),
      higherIsBetter: true,
    },
  ]

  // Column width based on agent count
  const colClass =
    agents.length === 2
      ? 'w-1/2'
      : agents.length === 3
        ? 'w-1/3'
        : 'w-1/4'

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background">
      {/* Agent headers */}
      <div className="flex border-b border-border">
        {/* Label column */}
        <div className="w-40 shrink-0 bg-muted/70 p-3" />

        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`${colClass} p-4 border-l border-border bg-muted/50`}
          >
            <Link
              href={`/oracle/agents/${agent.id}`}
              className="block hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2 mb-1">
                <StatusIndicator active={agent.active === true} variant="dot" />
                <span className="text-sm font-bold text-foreground truncate">
                  {agent.display_name ?? `Agent #${agent.erc8004_id}`}
                </span>
              </div>
              {agent.ecosystem && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {agent.ecosystem}
                </span>
              )}
              {agent.ens_name && (
                <div className="text-[10px] text-emerald-400 font-mono mt-1">
                  {agent.ens_name}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground font-mono mt-1">
                #{agent.erc8004_id}
              </div>
            </Link>
          </div>
        ))}
      </div>

      {/* Reputation row (special rendering) */}
      <div className="flex border-b border-border">
        <div className="w-40 shrink-0 px-3 py-3 bg-muted/30 flex items-center">
          <span className="text-xs text-muted-foreground">Reputation</span>
        </div>
        {agents.map((agent, idx) => {
          const repValue = agent.reputation_json?.avg_value ?? null
          const allValues = agents.map((a) => a.reputation_json?.avg_value ?? null)
          const winnerIdx = getWinnerIndex(allValues, true)

          return (
            <div
              key={agent.id}
              className={`${colClass} px-4 py-3 border-l border-border ${
                idx === winnerIdx ? 'bg-emerald-500/5' : ''
              }`}
            >
              <ReputationGauge value={repValue} />
              {agent.reputation_json?.feedback_count != null && agent.reputation_json.feedback_count > 0 && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  {agent.reputation_json.feedback_count} signals
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Metric rows */}
      {metrics.map((metric) => {
        const winnerIdx = getWinnerIndex(metric.rawValues, metric.higherIsBetter)

        return (
          <div key={metric.label} className="flex border-b border-border last:border-0">
            <div className="w-40 shrink-0 px-3 py-2.5 bg-muted/30 flex items-center">
              <span className="text-xs text-muted-foreground">{metric.label}</span>
            </div>
            {metric.values.map((value, idx) => (
              <div
                key={agents[idx].id}
                className={`${colClass} px-4 py-2.5 border-l border-border ${
                  idx === winnerIdx ? 'bg-emerald-500/5' : ''
                }`}
              >
                <span
                  className={`text-sm font-mono font-bold ${
                    idx === winnerIdx ? 'text-emerald-400' : 'text-foreground'
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        )
      })}

      {/* Services list */}
      <div className="flex border-t border-border">
        <div className="w-40 shrink-0 px-3 py-3 bg-muted/30 flex items-start">
          <span className="text-xs text-muted-foreground">Services</span>
        </div>
        {agents.map((agent) => {
          const meta = agent.metadata_json ?? {}
          const services = Array.isArray(meta.services) ? meta.services : []

          return (
            <div
              key={agent.id}
              className={`${colClass} px-4 py-3 border-l border-border`}
            >
              {services.length === 0 ? (
                <span className="text-xs text-muted-foreground">None</span>
              ) : (
                <div className="space-y-0.5">
                  {services.slice(0, 5).map((s: any, i: number) => (
                    <div
                      key={i}
                      className="text-xs text-muted-foreground truncate"
                    >
                      {s.name ?? 'Unnamed'}
                    </div>
                  ))}
                  {services.length > 5 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{services.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
