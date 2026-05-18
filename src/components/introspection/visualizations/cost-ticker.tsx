'use client'

/**
 * CostTicker — Running cost counter for cost_update events.
 */

import { cn } from '@/lib/utils'

interface CostTickerProps {
  costUsd: number
  totalTokens?: number
  className?: string
}

export function CostTicker({ costUsd, totalTokens, className }: CostTickerProps) {
  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <span className="text-muted-foreground">Cost</span>
      <span className="text-foreground font-mono tabular-nums">
        ${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(3)}
      </span>
      {totalTokens != null && totalTokens > 0 && (
        <span className="text-muted-foreground text-[10px]">
          {totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens} tokens
        </span>
      )}
    </div>
  )
}
