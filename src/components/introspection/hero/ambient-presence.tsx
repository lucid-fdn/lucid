'use client'

/**
 * AmbientPresence — The dreaming state visualization for hero mode.
 *
 * Beautiful enough to leave on a screen. Shows:
 * - CSS radial gradient background shifting with emotion
 * - Channel activity as subtle concentric pulses
 * - Scheduled task countdowns as orbital text
 * - Memory count as AnimatedNumber
 * - AgentPulse centered
 * - ToolOrbit ring around pulse
 *
 * RAF-throttled, pauses when tab is hidden.
 */

import { useEffect, useState } from 'react'
import { setVisibleInterval } from '@/lib/utils/visible-interval'
import { motion, useReducedMotion } from 'motion/react'
import { EMOTION_VISUALS } from '../emotion-visuals'
import { AgentPulse } from './agent-pulse'
import { ToolOrbit } from './tool-orbit'
import { AnimatedNumber } from '@/components/animated-number'
import type { IntrospectionEmotion } from '@contracts/introspection'
import type { ToolUsageStat } from '@/hooks/use-tool-usage-stats'

interface AmbientPresenceProps {
  emotion: IntrospectionEmotion
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
  memoryCount?: number
  toolStats: ToolUsageStat[]
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
  return `${Math.floor(diff / 3600000)}h ago`
}

function TaskCountdownLine({ label, targetIso }: { label: string; targetIso: string }) {
  const [display, setDisplay] = useState(() => formatCountdown(targetIso))

  useEffect(() => {
    return setVisibleInterval(() => setDisplay(formatCountdown(targetIso)), 1000)
  }, [targetIso])

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground truncate max-w-[180px]">{label}</span>
      <span className="text-muted-foreground/60">&rarr;</span>
      <span className="text-foreground/70 font-mono text-[10px]">{display}</span>
    </div>
  )
}

export function AmbientPresence({
  emotion,
  channels,
  tasks,
  lastMemory,
  memoryCount = 0,
  toolStats,
  className,
}: AmbientPresenceProps) {
  const visual = EMOTION_VISUALS[emotion]
  const prefersReducedMotion = useReducedMotion()
  const pendingTasks = tasks?.filter((t) => t.next_run_at) ?? []

  return (
    <div
      className={`relative flex flex-col items-center justify-center min-h-0 h-full overflow-hidden ${className ?? ''}`}
      style={{ background: visual.gradient }}
    >
      {/* Scan line — active listening feel (idle only) */}
      {!prefersReducedMotion && emotion === 'idle' && (
        <motion.div
          className="absolute left-0 right-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(to right, transparent, rgba(113,113,122,0.12) 40%, rgba(113,113,122,0.12) 60%, transparent)',
          }}
          initial={{ top: '10%' }}
          animate={{ top: '90%' }}
          transition={{
            duration: 4.5,
            repeat: Infinity,
            repeatDelay: 3,
            ease: 'linear',
          }}
        />
      )}

      {/* Central pulse + tool orbit */}
      <div className="relative flex items-center justify-center">
        <AgentPulse
          emotion={emotion}
          size="lg"
          layoutId="agent-pulse"
        />
        {!prefersReducedMotion && (
          <ToolOrbit
            tools={toolStats}
            emotion={emotion}
            className="absolute inset-0"
          />
        )}
      </div>

      {/* Status info below center */}
      <div className="mt-8 space-y-4 text-center max-w-sm px-4">
        {/* Channels */}
        {channels && channels.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-1"
          >
            <span className="text-[13px] font-medium text-muted-foreground">
              Listening on {channels.length} channel{channels.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {channels.map((ch, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      (ch.message_count ?? 0) > 0 ? 'bg-emerald-400' : 'bg-muted'
                    }`}
                  />
                  <span className="text-muted-foreground">{ch.name || ch.type}</span>
                  {ch.message_count != null && (
                    <span className="text-muted-foreground/60 text-[10px]">{ch.message_count}</span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Scheduled tasks */}
        {pendingTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-1"
          >
            <span className="text-[13px] font-medium text-muted-foreground">
              {pendingTasks.length} pending task{pendingTasks.length !== 1 ? 's' : ''}
            </span>
            {pendingTasks.slice(0, 3).map((task) => (
              <TaskCountdownLine
                key={task.id}
                label={task.label}
                targetIso={task.next_run_at!}
              />
            ))}
          </motion.div>
        )}

        {/* Last memory */}
        {lastMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xs"
          >
            <span className="text-muted-foreground italic truncate block max-w-[280px]">
              &quot;{lastMemory.content}&quot;
            </span>
            <span className="text-muted-foreground/60 text-[10px]">
              {formatRelative(lastMemory.created_at)}
            </span>
          </motion.div>
        )}

        {/* Memory count */}
        {memoryCount > 0 && (
          <div className="text-muted-foreground/60 text-[10px]">
            <AnimatedNumber start={0} end={memoryCount} /> facts learned
          </div>
        )}
      </div>
    </div>
  )
}
