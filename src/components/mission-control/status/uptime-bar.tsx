'use client'
import { cn } from '@/lib/utils'

interface UptimeBarProps {
  /** Uptime percentage 0-100 */
  uptimePercent: number
  /** Number of days shown */
  days?: number
}

export function UptimeBar({ uptimePercent, days = 90 }: UptimeBarProps) {
  const color =
    uptimePercent >= 99.5
      ? 'text-green-500'
      : uptimePercent >= 95
        ? 'text-yellow-500'
        : 'text-red-500'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Uptime ({days}d)</span>
        <span className={cn('font-medium tabular-nums', color)}>
          {uptimePercent.toFixed(2)}%
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full',
            uptimePercent >= 99.5
              ? 'bg-green-500'
              : uptimePercent >= 95
                ? 'bg-yellow-500'
                : 'bg-red-500'
          )}
          style={{ width: `${Math.min(uptimePercent, 100)}%` }}
        />
      </div>
    </div>
  )
}
