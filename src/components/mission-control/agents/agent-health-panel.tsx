'use client'

import { HealthScoreBadge } from '@/components/mission-control/health-score-badge'
import { RadialGauge } from '@/components/mission-control/radial-gauge'
import { Activity } from 'lucide-react'
import {
  HEALTH_DIMENSION_WEIGHT_PCT,
  HEALTH_DIMENSION_ORDER,
  type HealthDimensionKey,
} from '@/lib/mission-control/health-score-constants'
import { PanelLayout, PanelStateCard, PanelDetailBlock } from '@/components/panels/panel-layout'

interface AgentHealthPanelProps {
  healthScore: number | null
  dimensionScores?: Record<string, number>
  fleetPercentile?: number | null
}

const SHORT_LABELS: Record<HealthDimensionKey, string> = {
  error_rate: 'Errors',
  latency: 'Latency',
  tool_reliability: 'Tools',
  memory_health: 'Memory',
  user_satisfaction: 'Users',
  cost_efficiency: 'Cost',
}

export function AgentHealthPanel({ healthScore, dimensionScores, fleetPercentile }: AgentHealthPanelProps) {
  const pending = healthScore == null
  const scores = dimensionScores ?? {}

  const stateBlock = pending ? (
    <PanelStateCard
      icon={<Activity className="h-4 w-4 text-muted-foreground" />}
      title="Warming up"
      subtitle="Score appears after first activity"
      status={
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Monitoring
        </span>
      }
    />
  ) : (
    <div className="flex items-center gap-4">
      <HealthScoreBadge score={healthScore} size="lg" />
      <div>
        <p className="text-sm font-medium text-foreground">Overall health</p>
        {fleetPercentile != null && (
          <p className="text-[11px] text-muted-foreground">Top {100 - fleetPercentile}% of fleet</p>
        )}
      </div>
    </div>
  )

  return (
    <PanelLayout
      context="6-dimension health score, updated hourly from agent activity."
      state={stateBlock}
    >
      {/* Dimension gauges */}
      <div className="grid grid-cols-3 gap-3 py-1">
        {HEALTH_DIMENSION_ORDER.map((key) => (
          <RadialGauge
            key={key}
            value={scores[key] ?? null}
            label={SHORT_LABELS[key]}
            sublabel={`${HEALTH_DIMENSION_WEIGHT_PCT[key]}%`}
            colorScheme="health"
            size={56}
          />
        ))}
      </div>

      {pending && (
        <PanelDetailBlock>
          <p className="text-[10px] text-muted-foreground">
            Scores update hourly once this agent processes its first message.
          </p>
        </PanelDetailBlock>
      )}
    </PanelLayout>
  )
}
