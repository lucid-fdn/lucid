'use client'

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface MetricBarProps {
  label: string
  value: number | null
  icon: LucideIcon
}

export function MetricBar({ label, value, icon: Icon }: MetricBarProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
      <span className="text-muted-foreground/60 w-8">{label}</span>
      <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            value != null && value > 80
              ? 'bg-red-500'
              : value != null && value > 60
                ? 'bg-amber-500'
                : 'bg-green-500'
          )}
          style={{ width: `${Math.min(value ?? 0, 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground/60 tabular-nums w-8 text-right">
        {value != null ? `${Math.round(value)}%` : '--'}
      </span>
    </div>
  )
}

/** Color class for metric values in tables/text */
export function metricColor(value: number): string {
  if (value > 80) return 'text-red-500'
  if (value > 60) return 'text-amber-500'
  return 'text-muted-foreground'
}
