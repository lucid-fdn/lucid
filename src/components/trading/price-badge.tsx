'use client'

import { cn } from '@/lib/utils'
import { formatProbability, probabilityColor } from '@/lib/trading/format'

interface PriceBadgeProps {
  price: number
  outcome?: 'Yes' | 'No' | string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Displays a 0-1 probability as a colored percentage.
 * Reusable across predictions, orderbooks, market cards.
 */
export function PriceBadge({ price, outcome, size = 'sm', className }: PriceBadgeProps) {
  const textSize = size === 'md' ? 'text-sm' : 'text-xs'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono tabular-nums',
        textSize,
        probabilityColor(price),
        className,
      )}
    >
      {outcome && (
        <span className={cn('font-medium', outcome === 'Yes' ? 'text-green-400' : 'text-red-400')}>
          {outcome}
        </span>
      )}
      {formatProbability(price)}
    </span>
  )
}
