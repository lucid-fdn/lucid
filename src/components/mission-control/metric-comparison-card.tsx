'use client'

/**
 * MetricComparisonCard — Shows a metric value with comparison to previous period.
 *
 * Inspired by abhi1693's time-bucketed metric comparisons: "this period vs last."
 * Displays current value, delta, and trend indicator.
 */

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { WorkspaceMetricCard } from '@/components/workspace/workspace-metric-card'

interface MetricComparisonCardProps {
  /** Metric label */
  label: string
  /** Current period value */
  current: number
  /** Previous period value (for comparison) */
  previous: number
  /** Format function (default: number with locale) */
  format?: (value: number) => string
  /** Icon to display */
  icon?: LucideIcon
  /** Whether "up" is good (e.g., revenue) or bad (e.g., errors) */
  upIsGood?: boolean
  /** Unit label (e.g., "runs", "USD", "%") */
  unit?: string
  className?: string
}

export function MetricComparisonCard({
  label,
  current,
  previous,
  format = formatDefault,
  icon: Icon,
  upIsGood = true,
  unit,
  className,
}: MetricComparisonCardProps) {
  const delta = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0
  const isUp = delta > 0
  const isDown = delta < 0
  const isNeutral = delta === 0

  const trendIsGood = isUp ? upIsGood : isDown ? !upIsGood : true
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus

  const trendColor = isNeutral
    ? 'text-muted-foreground'
    : trendIsGood
      ? 'text-green-500'
      : 'text-red-500'

  return (
    <WorkspaceMetricCard
      label={label}
      value={`${format(current)}${unit ? ` ${unit}` : ''}`}
      detail={`prev: ${format(previous)}${unit ? ` ${unit}` : ''}`}
      icon={Icon}
      tone={isNeutral ? 'default' : trendIsGood ? 'success' : 'danger'}
      density="compact"
      className={className}
    >
      {!isNeutral ? (
        <div className={cn('mt-2 flex items-center gap-0.5 text-xs', trendColor)}>
          <TrendIcon className="h-3 w-3" />
          <span className="tabular-nums">{Math.abs(Math.round(delta))}%</span>
        </div>
      ) : null}
    </WorkspaceMetricCard>
  )
}

function formatDefault(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

/** Format as USD */
export function formatUsd(value: number): string {
  return `$${formatDefault(value)}`
}
