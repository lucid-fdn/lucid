'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ConnectionStatus } from '../connection-status'
import { MetricBar } from '../metric-bar'
import { RadialGaugeRow } from '../radial-gauge'
import { PROVIDER_LABELS, formatRelativeTime } from '@/lib/mission-control/constants'
import { getConnectionStatus } from '@/lib/mission-control/types'
import { detectRuntimeIssues, countIssues } from '@/lib/mission-control/issue-detector'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import { Cpu, HardDrive, MemoryStick, Server, Trash2, Radio, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RuntimeCardProps {
  runtime: DedicatedRuntime
  onRemove?: (id: string) => void
  onClick?: (id: string) => void
  /** Use radial gauges instead of bar metrics (default: false) */
  radialGauges?: boolean
}

export function RuntimeCard({ runtime, onRemove, onClick, radialGauges = false }: RuntimeCardProps) {
  const status = getConnectionStatus(runtime.lastSeenAt)
  const isLucidOperated = runtime.managedByLucid || runtime.runtimeTier === 'dedicated'
  const providerLabel = isLucidOperated
    ? 'Lucid Cloud'
    : PROVIDER_LABELS[runtime.provider] || runtime.provider
  const runtimeVersion = [runtime.runtimeVersion, runtime.engineVersion, runtime.openclawVersion]
    .find((version) => version && version !== 'unknown')

  // Issue detection
  const issues = useMemo(() => detectRuntimeIssues(runtime), [runtime])
  const { warnings, criticals } = useMemo(() => countIssues(issues), [issues])
  const hasIssues = warnings > 0 || criticals > 0

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        status === 'connected' && !hasIssues && 'border-border/50',
        status === 'connected' && criticals > 0 && 'border-red-500/30 bg-red-500/5',
        status === 'connected' && criticals === 0 && warnings > 0 && 'border-amber-500/20 bg-amber-500/5',
        status === 'stale' && 'border-amber-500/20 bg-amber-500/5',
        status === 'offline' && 'border-border/30 opacity-60',
        onClick && 'cursor-pointer hover:bg-muted/30'
      )}
      onClick={() => onClick?.(runtime.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <ConnectionStatus lastSeenAt={runtime.lastSeenAt} />
          <div>
            <div className="font-medium text-sm flex items-center gap-1.5">
              {runtime.displayName}
              {/* Issue badge */}
              {hasIssues && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium',
                    criticals > 0
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-amber-500/10 text-amber-400',
                  )}
                  title={issues.map((i) => i.title).join(', ')}
                >
                  <AlertTriangle className="h-2 w-2" />
                  {criticals > 0 ? criticals : warnings}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5 flex-wrap">
              <span>{providerLabel}{runtimeVersion && ` \u00B7 v${runtimeVersion}`}</span>
              {runtime.channelMode && (
                <span className={cn(
                  'inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-medium',
                  runtime.channelMode === 'native'
                    ? 'bg-violet-500/10 text-violet-400'
                    : 'bg-blue-500/10 text-blue-400'
                )}>
                  <Radio className="h-2 w-2" />
                  {runtime.channelMode === 'native' ? 'C2a' : 'C1'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground/50 tabular-nums">
            {runtime.agentCount} agent{runtime.agentCount !== 1 ? 's' : ''}
          </span>
          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/40 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation() // Don't trigger card click
                onRemove(runtime.id)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {status !== 'offline' && (
        radialGauges ? (
          <RadialGaugeRow
            cpu={runtime.cpuPercent}
            ram={runtime.ramPercent}
            disk={runtime.diskPercent}
            gpu={runtime.gpuPercent}
          />
        ) : (
          <div className="space-y-1.5">
            <MetricBar label="CPU" value={runtime.cpuPercent} icon={Cpu} />
            <MetricBar label="RAM" value={runtime.ramPercent} icon={MemoryStick} />
            <MetricBar label="Disk" value={runtime.diskPercent} icon={HardDrive} />
            {runtime.gpuPercent != null && (
              <MetricBar label="GPU" value={runtime.gpuPercent} icon={Server} />
            )}
          </div>
        )
      )}

      {/* Issue descriptions (critical only, to keep card compact) */}
      {criticals > 0 && (
        <div className="mt-2 space-y-0.5">
          {issues
            .filter((i) => i.severity === 'critical')
            .map((issue) => (
              <p key={issue.id} className="text-[10px] text-red-400 truncate">
                {issue.description}
              </p>
            ))}
        </div>
      )}

      {runtime.lastSeenAt && (
        <div className="mt-2 text-[10px] text-muted-foreground/40">
          Last seen {formatRelativeTime(runtime.lastSeenAt)}
        </div>
      )}
    </div>
  )
}
