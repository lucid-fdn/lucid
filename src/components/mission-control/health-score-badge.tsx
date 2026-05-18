'use client'

import { cn } from '@/lib/utils'
import { HEALTH_SCORE_THRESHOLDS } from '@/lib/mission-control/health-score-constants'

interface HealthScoreBadgeProps {
  score: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function getScoreColor(score: number): string {
  if (score >= HEALTH_SCORE_THRESHOLDS.green) return 'bg-green-500/15 text-green-400 border-green-500/30'
  if (score >= HEALTH_SCORE_THRESHOLDS.yellow) return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
  if (score >= HEALTH_SCORE_THRESHOLDS.orange) return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
  return 'bg-red-500/15 text-red-400 border-red-500/30'
}

export function HealthScoreBadge({ score, size = 'sm', className }: HealthScoreBadgeProps) {
  if (score == null) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded border px-1.5 py-0.5 font-mono',
          'bg-muted/50 text-muted-foreground/50 border-border/50',
          size === 'lg' ? 'text-lg px-2.5 py-1' : size === 'sm' ? 'text-[10px]' : 'text-xs',
          className
        )}
      >
        --
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 font-mono font-medium',
        getScoreColor(score),
        size === 'lg' ? 'text-lg px-2.5 py-1' : size === 'sm' ? 'text-[10px]' : 'text-xs',
        className
      )}
    >
      {Math.round(score)}
    </span>
  )
}
