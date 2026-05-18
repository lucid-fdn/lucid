'use client'

import { WorkspaceMetricCard } from '@/components/workspace/workspace-metric-card'
import type { RealtimeMetrics } from '@/hooks/use-realtime-metrics'

interface FleetKPIStripProps {
  metrics: RealtimeMetrics
  healthyCount: number
  needsAttentionCount: number
}

export function FleetKPIStrip({
  metrics,
  healthyCount,
  needsAttentionCount,
}: FleetKPIStripProps) {
  const totalAgents = metrics.total_agents
  const allHealthy = healthyCount === totalAgents && totalAgents > 0
  const healthyColor = allHealthy
    ? 'emerald'
    : healthyCount / Math.max(totalAgents, 1) >= 0.8
      ? undefined
      : 'amber'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <WorkspaceMetricCard
        label="Healthy agents"
        value={totalAgents > 0 ? `${healthyCount}/${totalAgents}` : '\u2014'}
        tone={healthyColor === 'emerald' ? 'success' : healthyColor === 'amber' ? 'warning' : 'default'}
        detail={totalAgents > 0 ? 'operational readiness' : 'no live agents'}
      />
      <WorkspaceMetricCard
        label="Needs attention"
        value={needsAttentionCount > 0 ? String(needsAttentionCount) : '\u2014'}
        tone={needsAttentionCount > 0 ? 'danger' : 'default'}
        detail={needsAttentionCount > 0 ? 'review recommended' : 'no urgent blockers'}
      />
      <WorkspaceMetricCard
        label="Active today"
        value={metrics.active_agents > 0 ? String(metrics.active_agents) : '\u2014'}
        detail={`${metrics.total_runs_24h} run${metrics.total_runs_24h === 1 ? '' : 's'} in 24h`}
      />
      <WorkspaceMetricCard
        label="Cost today"
        value={
          metrics.cost_today_usd > 0
            ? `$${metrics.cost_today_usd.toFixed(2)}`
            : '\u2014'
        }
        tone={metrics.cost_today_usd > 50 ? 'warning' : 'default'}
        detail={metrics.cost_today_usd > 0 ? 'workspace spend' : 'no spend yet'}
      />
    </div>
  )
}
