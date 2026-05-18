'use client'

import {
  MessageSquare,
  Brain,
  Cpu,
  Calendar,
  Activity,
  Shield,
  Sparkles,
  Wallet,
  DollarSign,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { formatDistanceToNow } from 'date-fns'
import { getChannelUiStats } from '@/lib/channels/types'
import type { AgentChannel as AssistantChannel } from '@/types/agent'
import type { AgentHealthScore } from '@/hooks/use-health-score'
import type { AgentPresence } from '@/lib/mission-control/types'
import type { FeedEvent } from '@/lib/mission-control/types'
import type { DedicatedRuntime, ScheduledTask } from '@/lib/mission-control/types'

interface OverviewSectionProps {
  // Agent state
  isActive: boolean
  presence?: AgentPresence
  // Health
  healthData: AgentHealthScore | null
  // Channels
  channels: AssistantChannel[]
  // Runtime
  runtimeId?: string | null
  runtimes: DedicatedRuntime[]
  // Memories
  memoriesTotal: number
  memoryEnabled: boolean
  // Tasks
  tasks?: ScheduledTask[]
  // Activity
  activityEvents: FeedEvent[]
  // Wallet
  walletEnabled: boolean
  // Skills count (optional)
  skillsCount?: number
  // Cost
  costTodayUsd?: number
  costMonthUsd?: number
  // Navigation
  onTabChange?: (tab: string) => void
  // Actions for empty-state cards
  onConnectChannel?: () => void
  onOpenChat?: () => void
  onAssignRuntime?: () => void
}

const miniCardClass = cn(
  'rounded-lg border border-border bg-card/50 p-4',
  'hover:border-primary/50 transition-colors duration-150 cursor-pointer',
  'group',
)

function MiniCard({
  icon,
  title,
  value,
  subtitle,
  action,
  status,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  value: string | number
  subtitle?: string
  action?: { label: string; onClick: () => void }
  status?: 'ok' | 'warn' | 'error' | 'neutral'
  onClick?: () => void
}) {
  const statusColor = {
    ok: 'text-emerald-400',
    warn: 'text-amber-400',
    error: 'text-red-400',
    neutral: 'text-muted-foreground',
  }[status ?? 'neutral']

  return (
    <div className={miniCardClass} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onClick?.() }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
        </div>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
      </div>
      <div className={cn('text-lg font-mono font-semibold tabular-nums', statusColor)}>
        {value}
      </div>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); action.onClick() }}
          className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          {action.label} &rarr;
        </button>
      )}
    </div>
  )
}

export function OverviewSection({
  isActive,
  presence,
  healthData,
  channels,
  runtimeId,
  runtimes,
  memoriesTotal,
  memoryEnabled,
  tasks = [],
  activityEvents,
  walletEnabled,
  skillsCount,
  costTodayUsd = 0,
  costMonthUsd = 0,
  onTabChange,
  onConnectChannel,
  onOpenChat,
  onAssignRuntime,
}: OverviewSectionProps) {
  const healthScore = healthData?.overall_score ?? null
  const healthStatus: 'ok' | 'warn' | 'error' | 'neutral' =
    healthScore == null ? 'neutral' :
    healthScore > 75 ? 'ok' :
    healthScore > 40 ? 'warn' : 'error'

  const channelStats = getChannelUiStats(channels)
  const activeChannels = channelStats.connected
  const totalChannels = channelStats.total

  const runtime = runtimeId ? runtimes.find(r => r.id === runtimeId) : null
  // shared = no runtime, dedicated = Lucid-managed, byo = user's own infra (show provider)
  const runtimeLabel = !runtimeId ? 'Lucid Cloud (Shared)'
    : runtime?.runtimeTier === 'byo' ? (runtime.provider ?? 'BYO')
    : 'Lucid Cloud (Dedicated)'

  const upcomingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'claimed' || t.status === 'running').length
  const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'dead_letter').length

  const recentEvents = activityEvents.slice(0, 5)
  const lastActivity = recentEvents[0]

  // Issues summary
  const issues: Array<{ label: string; level: 'warn' | 'error' }> = []
  if (healthScore != null && healthScore < 60) {
    issues.push({ label: `Health score ${healthScore}`, level: healthScore < 40 ? 'error' : 'warn' })
  }
  if (failedTasks > 0) {
    issues.push({ label: `${failedTasks} failed task${failedTasks > 1 ? 's' : ''}`, level: 'error' })
  }
  if (totalChannels > 0 && activeChannels === 0) {
    issues.push({ label: 'No active channels', level: 'warn' })
  }
  if (!isActive) {
    issues.push({ label: 'Agent paused', level: 'warn' })
  }

  return (
    <div className="space-y-6">
      {/* Issues banner */}
      {issues.length > 0 && (
        <div className={cn(
          'rounded-lg border p-4',
          issues.some(i => i.level === 'error')
            ? 'border-red-500/20 bg-red-500/5'
            : 'border-amber-500/20 bg-amber-500/5',
        )}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className={cn(
              'h-4 w-4',
              issues.some(i => i.level === 'error') ? 'text-red-400' : 'text-amber-400',
            )} />
            <span className="text-xs font-medium text-foreground">
              {issues.length} issue{issues.length > 1 ? 's' : ''} need{issues.length === 1 ? 's' : ''} attention
            </span>
          </div>
          <ul className="space-y-1">
            {issues.map((issue) => (
              <li key={issue.label} className={cn(
                'text-xs',
                issue.level === 'error' ? 'text-red-400' : 'text-amber-400',
              )}>
                {issue.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* State summary */}
      <div className="rounded-lg border border-border bg-card/50 p-4">
        <div className="flex items-center gap-3">
          <BreathingDot
            size="sm"
            color={isActive ? 'bg-emerald-400' : 'bg-amber-400'}
            animate={isActive && presence?.state !== 'idle'}
          />
          <div>
            <p className="text-sm text-foreground">
              {!isActive ? 'Paused' :
               presence?.state !== 'idle' ? 'Active — processing' :
               'Idle — waiting for messages'}
            </p>
            {lastActivity && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Last activity {formatDistanceToNow(new Date(lastActivity.created_at), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Metric cards grid */}
      <div className="grid grid-cols-2 gap-3">
        <MiniCard
          icon={<Activity className="h-3.5 w-3.5" />}
          title="Health"
          value={healthScore != null ? healthScore : 'Ready'}
          subtitle={healthScore != null ? (healthScore > 75 ? 'Stable' : healthScore > 40 ? 'Degraded' : 'Critical') : 'No issues detected'}
          status={healthStatus}
          onClick={() => onTabChange?.('health')}
        />
        <MiniCard
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Channels"
          value={`${activeChannels}/${totalChannels}`}
          subtitle={totalChannels === 0 ? 'Required to activate agent' : `${activeChannels} active`}
          action={totalChannels === 0 && onConnectChannel ? { label: 'Connect a channel', onClick: onConnectChannel } : undefined}
          status={totalChannels === 0 ? 'neutral' : activeChannels > 0 ? 'ok' : 'warn'}
          onClick={() => onTabChange?.('channels')}
        />
        <MiniCard
          icon={<Cpu className="h-3.5 w-3.5" />}
          title="Runtime"
          value={runtimeLabel}
          subtitle={runtime?.status ?? (runtimeId ? 'Assigned' : 'Shared runtime (default) \u00B7 Upgrade for dedicated performance')}
          action={!runtimeId && onAssignRuntime ? { label: 'Assign dedicated runtime', onClick: onAssignRuntime } : undefined}
          status={runtime ? (runtime.status === 'connected' ? 'ok' : 'warn') : 'neutral'}
          onClick={() => onTabChange?.('runtime')}
        />
        <MiniCard
          icon={<Calendar className="h-3.5 w-3.5" />}
          title="Tasks"
          value={upcomingTasks}
          subtitle={failedTasks > 0 ? `${failedTasks} failed` : upcomingTasks > 0 ? 'Scheduled' : 'None scheduled'}
          status={failedTasks > 0 ? 'error' : upcomingTasks > 0 ? 'ok' : 'neutral'}
          onClick={() => onTabChange?.('tasks')}
        />
        <MiniCard
          icon={<Brain className="h-3.5 w-3.5" />}
          title="Memories"
          value={memoriesTotal}
          subtitle={!memoryEnabled ? 'Disabled' : memoriesTotal === 0 ? 'None yet' : 'Facts stored'}
          status={!memoryEnabled ? 'warn' : memoriesTotal > 0 ? 'ok' : 'neutral'}
          onClick={() => onTabChange?.('memories')}
        />
        <MiniCard
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="Skills"
          value={skillsCount ?? 0}
          subtitle="Available skills"
          status="neutral"
          onClick={() => onTabChange?.('skills')}
        />
        <MiniCard
          icon={<DollarSign className="h-3.5 w-3.5" />}
          title="Cost today"
          value={`$${costTodayUsd.toFixed(2)}`}
          subtitle={costMonthUsd > 0 ? `$${costMonthUsd.toFixed(2)} this month` : 'No spend'}
          status={costTodayUsd > 1 ? 'warn' : 'neutral'}
          onClick={() => onTabChange?.('health')}
        />
        {walletEnabled && (
          <MiniCard
            icon={<Wallet className="h-3.5 w-3.5" />}
            title="Wallet"
            value="Enabled"
            subtitle="Trading active"
            status="ok"
            onClick={() => onTabChange?.('channels')}
          />
        )}
        <MiniCard
          icon={<Shield className="h-3.5 w-3.5" />}
          title="Guardrails"
          value="Active"
          subtitle="Safety policies"
          status="ok"
          onClick={() => onTabChange?.('guardrails')}
        />
      </div>

      {/* Recent activity */}
      {recentEvents.length > 0 && (
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Recent activity</h3>
          <div className="space-y-2">
            {recentEvents.map((event, i) => (
              <div key={event.id ?? i} className="flex items-center gap-2 text-xs">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  event.event_type === 'error' ? 'bg-red-400' :
                  event.event_type === 'approval_requested' ? 'bg-amber-400' :
                  'bg-muted-foreground',
                )} />
                <span className="text-muted-foreground truncate flex-1">
                  {(event.payload as Record<string, unknown>)?.summary as string ?? event.event_type ?? 'Event'}
                </span>
                <span className="text-muted-foreground/50 text-[10px] shrink-0">
                  {event.created_at ? formatDistanceToNow(new Date(event.created_at), { addSuffix: true }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
