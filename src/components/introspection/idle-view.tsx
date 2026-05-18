'use client'

/**
 * IdleView — The dreaming state. All real data, no simulation.
 *
 * Shows operational data when agent has no active run:
 * - Channels being monitored with message counts
 * - Scheduled tasks with real-time countdowns
 * - Last memory learned
 */

import { useEffect, useState } from 'react'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { cn } from '@/lib/utils'

interface IdleViewProps {
  channels?: Array<{
    type: string
    name?: string
    message_count?: number
  }>
  tasks?: Array<{
    id: string
    label: string
    next_run_at?: string
  }>
  lastMemory?: {
    content: string
    created_at: string
  } | null
  className?: string
}

function formatCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) return `${minutes}m ${secs}s`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function TaskCountdown({ targetIso }: { targetIso: string }) {
  const [display, setDisplay] = useState(() => formatCountdown(targetIso))

  useEffect(() => {
    const timer = setInterval(() => {
      setDisplay(formatCountdown(targetIso))
    }, 1000)
    return () => clearInterval(timer)
  }, [targetIso])

  return <span className="text-muted-foreground font-mono text-[10px]">{display}</span>
}

export function IdleView({ channels, tasks, lastMemory, className }: IdleViewProps) {
  const activeChannels = channels?.filter((c) => c.message_count && c.message_count > 0)
  const pendingTasks = tasks?.filter((t) => t.next_run_at)

  return (
    <div className={cn('px-4 py-3 space-y-4', className)}>
      {/* Idle header */}
      <div className="flex items-center gap-2">
        <BreathingDot color="bg-zinc-500" animate size="sm" />
        <span className="text-muted-foreground text-xs">Idle</span>
      </div>

      {/* Channels */}
      {channels && channels.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            Monitoring {channels.length} channel{channels.length !== 1 ? 's' : ''}
          </span>
          {channels.map((ch, i) => (
            <div key={i} className="flex items-center gap-2 text-xs pl-2">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  ch.message_count && ch.message_count > 0
                    ? 'bg-emerald-400'
                    : 'bg-zinc-700',
                )}
              />
              <span className="text-muted-foreground">{ch.name || ch.type}</span>
              {ch.message_count != null && (
                <span className="text-muted-foreground text-[10px]">
                  {ch.message_count} messages
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Scheduled tasks */}
      {pendingTasks && pendingTasks.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            {pendingTasks.length} scheduled task{pendingTasks.length !== 1 ? 's' : ''}
          </span>
          {pendingTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 text-xs pl-2">
              <span className="text-muted-foreground truncate max-w-[150px]">&quot;{task.label}&quot;</span>
              <span className="text-muted-foreground">→ in</span>
              {task.next_run_at && <TaskCountdown targetIso={task.next_run_at} />}
            </div>
          ))}
        </div>
      )}

      {/* Last memory */}
      {lastMemory && (
        <div className="space-y-1">
          <span className="text-[13px] font-medium text-muted-foreground">Last learned</span>
          <div className="text-xs pl-2">
            <span className="text-muted-foreground italic truncate block max-w-[250px]">
              &quot;{lastMemory.content}&quot;
            </span>
            <span className="text-muted-foreground text-[10px]">
              {formatRelative(lastMemory.created_at)}
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!channels?.length && !pendingTasks?.length && !lastMemory && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-foreground">Waiting for first activity.</p>
          <p className="text-xs text-muted-foreground mt-1">Send a message or trigger a scheduled task.</p>
        </div>
      )}
    </div>
  )
}
