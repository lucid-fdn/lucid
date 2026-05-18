'use client'

import { cn } from '@/lib/utils'
import { EMOTION_VISUALS } from './emotion-visuals'
import type { RunSummary } from '@/hooks/use-run-history'

interface RunSummaryCardProps {
  run: RunSummary
  onTap?: (runId: string) => void
  className?: string
}

export function RunSummaryCard({ run, onTap, className }: RunSummaryCardProps) {
  const visual = EMOTION_VISUALS[run.emotion]

  const duration = run.durationMs < 1000
    ? `${run.durationMs}ms`
    : `${(run.durationMs / 1000).toFixed(1)}s`

  const cost = run.costUsd > 0
    ? `$${run.costUsd < 0.01 ? run.costUsd.toFixed(4) : run.costUsd.toFixed(3)}`
    : null

  const parts = [
    run.toolCount > 0 ? `${run.toolCount} tools` : null,
    duration,
    cost,
  ].filter(Boolean)

  return (
    <button
      type="button"
      onClick={() => onTap?.(run.runId)}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-3 text-left',
        'border border-transparent hover:border-border transition-colors duration-150 rounded-sm',
        className,
      )}
    >
      {/* Emotion dot */}
      <span
        className={cn('w-2 h-2 rounded-full shrink-0', visual.dot)}
      />

      {/* Summary text */}
      <span className="text-xs text-muted-foreground truncate">
        {parts.join(' \u00b7 ')}
      </span>

      {/* Active indicator */}
      {run.isActive && (
        <span className="text-[10px] text-emerald-400 shrink-0">running</span>
      )}
    </button>
  )
}
