'use client'

import { cn } from '@/lib/utils'
import { formatUsd, formatPnlPercent, pnlColor, pnlBgColor } from '@/lib/trading/format'

interface PnlBadgeProps {
  pnlUsd: number
  pnlPercent?: number
  className?: string
}

/**
 * Displays P&L with color coding (green positive, red negative).
 * Reusable across predictions, perps, portfolio views.
 */
export function PnlBadge({ pnlUsd, pnlPercent, className }: PnlBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-mono tabular-nums',
        pnlBgColor(pnlUsd),
        pnlColor(pnlUsd),
        className,
      )}
    >
      {formatUsd(pnlUsd)}
      {pnlPercent != null && (
        <span className="text-[10px] opacity-70">{formatPnlPercent(pnlPercent)}</span>
      )}
    </span>
  )
}
