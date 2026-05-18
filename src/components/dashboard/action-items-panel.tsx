'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Bell, Activity, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RealtimeMetrics } from '@/hooks/use-realtime-metrics'
import type { Agent as Assistant } from '@/types/agent'

interface ActionItemsPanelProps {
  metrics: RealtimeMetrics
  agents: Assistant[]
  healthScores: Record<string, number | null>
}

interface ActionItem {
  icon: ReactNode
  label: string
  count: number
  color: 'red' | 'amber'
}

export function ActionItemsPanel({
  metrics,
  agents,
  healthScores,
}: ActionItemsPanelProps) {
  const items: ActionItem[] = []

  if (metrics.pending_approvals > 0) {
    items.push({
      icon: <Bell className="h-3.5 w-3.5" />,
      label: 'Pending approvals',
      count: metrics.pending_approvals,
      color: 'amber',
    })
  }

  if (metrics.errors_24h > 0) {
    items.push({
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: 'Errors (24h)',
      count: metrics.errors_24h,
      color: 'red',
    })
  }

  const degradedAgents = agents.filter((a) => {
    const score = healthScores[a.id]
    return score != null && score < 60
  })

  if (degradedAgents.length > 0) {
    items.push({
      icon: <Activity className="h-3.5 w-3.5" />,
      label: 'Degraded health',
      count: degradedAgents.length,
      color: 'amber',
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/55 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">No urgent action</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Approvals, recent errors, and degraded agents will appear here when they need operator review.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-card/55 p-4">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Action items
      </div>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm',
            item.color === 'red'
              ? 'bg-red-500/5 text-red-400'
              : 'bg-amber-500/5 text-amber-400',
          )}
        >
          {item.icon}
          <span className="flex-1">{item.label}</span>
          <span className="font-mono text-xs font-medium">{item.count}</span>
        </div>
      ))}
    </div>
  )
}
