'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { getChannelUiStats } from '@/lib/channels/types'
import type { AgentHealthScore } from '@/hooks/use-health-score'
import type { AgentPresence } from '@/lib/mission-control/types'
import type { AgentChannel as AssistantChannel } from '@/types/agent'

interface OperationalStripProps {
  healthData: AgentHealthScore | null
  presence?: AgentPresence
  channels: AssistantChannel[]
  costTodayUsd?: number
  costMonthUsd?: number
  recentRunCount?: number
  onHealthClick?: () => void
  onChannelsClick?: () => void
  onActivityClick?: () => void
  onCostClick?: () => void
}

function healthSubtitle(data: AgentHealthScore | null): string {
  if (!data) return 'No issues detected'
  const score = data.overall_score
  if (score > 75) return 'Stable'
  if (score > 40) return 'Degraded'
  return 'Critical'
}

function healthColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground'
  if (score > 75) return 'text-emerald-400'
  if (score > 40) return 'text-amber-400'
  return 'text-red-400'
}

export function OperationalStrip({
  healthData,
  presence,
  channels,
  costTodayUsd = 0,
  costMonthUsd = 0,
  recentRunCount,
  onHealthClick,
  onChannelsClick,
  onActivityClick,
  onCostClick,
}: OperationalStripProps) {
  const score = healthData?.overall_score ?? null
  const channelStats = useMemo(() => getChannelUiStats(channels), [channels])
  const activeChannels = channelStats.connected
  const totalChannels = channelStats.total
  const hasActiveRun = presence?.state != null && presence.state !== 'idle'

  const allHealthy = score != null && score > 75
  const borderGlow = allHealthy ? 'border-b-emerald-500/20' : 'border-b-border'

  return (
    <div
      className={cn(
        'grid grid-cols-4 gap-0 bg-background border-b',
        borderGlow,
      )}
    >
      {/* Health */}
      <button
        type="button"
        onClick={onHealthClick}
        className="py-4 px-6 text-left hover:bg-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className={cn('text-2xl font-mono font-semibold', healthColor(score))}>
          {score ?? 'Ready'}
        </div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
          Health
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {healthSubtitle(healthData)}
        </div>
      </button>

      {/* Channels */}
      <button
        type="button"
        onClick={onChannelsClick}
        className="py-4 px-6 text-left hover:bg-accent transition-colors duration-150 border-l border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="text-2xl font-mono font-semibold text-foreground">
          {totalChannels > 0 ? `${activeChannels}/${totalChannels}` : '0'}
        </div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
          Channels
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {totalChannels > 0 ? `${activeChannels} active` : '0 connected'}
        </div>
      </button>

      {/* Activity */}
      <button
        type="button"
        onClick={onActivityClick}
        className="py-4 px-6 text-left hover:bg-accent transition-colors duration-150 border-l border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl font-mono font-semibold text-foreground">
            {(recentRunCount ?? 0) > 0 ? recentRunCount : 'None'}
          </span>
          {hasActiveRun && (
            <BreathingDot color="bg-emerald-400" animate size="sm" />
          )}
        </div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
          Activity
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {hasActiveRun ? 'Run in progress' : (recentRunCount ?? 0) > 0 ? 'Recent runs' : 'No runs yet'}
        </div>
      </button>

      {/* Cost */}
      <button
        type="button"
        onClick={onCostClick}
        className="py-4 px-6 text-left hover:bg-accent transition-colors duration-150 border-l border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="text-2xl font-mono font-semibold text-foreground">
          {`$${costTodayUsd.toFixed(2)}`}
        </div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
          Cost today
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {costMonthUsd > 0 ? `$${costMonthUsd.toFixed(2)} this month` : 'No spend'}
        </div>
      </button>
    </div>
  )
}
