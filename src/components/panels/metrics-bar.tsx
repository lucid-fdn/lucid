'use client'

import { AnimatedCounter } from '@/components/oracle/animated-counter'
import { MiniSparkline } from '@/components/oracle/mini-sparkline'
import { cn } from '@/lib/utils'

interface Metric {
  label: string
  value: number
  /** Optional prefix (e.g. "$") */
  prefix?: string
  /** Optional suffix (e.g. "K", "ms") */
  suffix?: string
  /** Decimal places (default 0) */
  decimals?: number
  /** Trend data for sparkline */
  trend?: number[]
  /** Sparkline color (default blue) */
  color?: string
}

interface MetricsBarProps {
  metrics: Metric[]
  className?: string
}

export function MetricsBar({ metrics, className }: MetricsBarProps) {
  if (metrics.length === 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-3 py-2',
        'border-b border-border bg-muted/30',
        className,
      )}
    >
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center gap-2">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">
              {m.label}
            </span>
            <AnimatedCounter
              value={m.value}
              prefix={m.prefix}
              suffix={m.suffix}
              decimals={m.decimals}
              className="text-xs font-mono font-bold text-foreground"
            />
          </div>
          {m.trend && m.trend.length > 1 && (
            <MiniSparkline
              data={m.trend}
              width={40}
              height={16}
              color={m.color ?? '#3b82f6'}
            />
          )}
        </div>
      ))}
    </div>
  )
}
