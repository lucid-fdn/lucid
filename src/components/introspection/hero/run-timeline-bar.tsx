'use client'

/**
 * RunTimelineBar — Bottom bar showing recent run history as colored segments.
 *
 * Each run is a segment, width proportional to duration (min 4px).
 * Active run pulses on right edge. Click scrolls to run in stream.
 */

import { useRef, useCallback } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { EMOTION_VISUALS } from '../emotion-visuals'
import type { RunSummary } from '@/hooks/use-run-history'
import type { IntrospectionEmotion } from '@contracts/introspection'

interface RunTimelineBarProps {
  runs: RunSummary[]
  onRunClick?: (runId: string) => void
  className?: string
}

const EMOTION_SEGMENT_COLORS: Record<IntrospectionEmotion, string> = {
  idle: 'bg-zinc-700',
  confident: 'bg-emerald-500/60',
  cautious: 'bg-amber-500/60',
  strained: 'bg-red-500/60',
  learning: 'bg-blue-500/60',
}

function formatRunTooltip(run: RunSummary): string {
  const dur = run.durationMs < 1000
    ? `${run.durationMs}ms`
    : `${(run.durationMs / 1000).toFixed(1)}s`
  const parts = [dur]
  if (run.costUsd > 0) parts.push(`$${run.costUsd.toFixed(4)}`)
  if (run.toolCount > 0) parts.push(`${run.toolCount} tools`)
  return parts.join(' \u00b7 ')
}

export function RunTimelineBar({ runs, onRunClick, className }: RunTimelineBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(
    (runId: string) => {
      onRunClick?.(runId)
    },
    [onRunClick],
  )

  if (runs.length === 0) return null

  const maxDuration = Math.max(...runs.map((r) => r.durationMs), 1)

  return (
    <div
      className={cn(
        'h-12 flex items-center gap-px px-3 bg-background border-t border-border overflow-x-auto',
        className,
      )}
      ref={scrollRef}
    >
      {runs.map((run) => {
        // Width proportional to duration, min 4px, max 120px
        const ratio = run.durationMs / maxDuration
        const width = Math.max(4, Math.round(ratio * 120))
        const colorClass = EMOTION_SEGMENT_COLORS[run.emotion]

        return (
          <motion.button
            key={run.runId}
            type="button"
            title={formatRunTooltip(run)}
            onClick={() => handleClick(run.runId)}
            className={cn(
              'relative h-6 rounded-sm transition-all duration-150 hover:brightness-125 cursor-pointer shrink-0',
              colorClass,
            )}
            style={{ width }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {/* Active run: pulsing right edge */}
            {run.isActive && (
              <motion.div
                className="absolute right-0 top-0 bottom-0 w-1 bg-white/30 rounded-r-sm"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
