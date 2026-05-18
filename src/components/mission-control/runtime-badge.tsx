'use client'

import { cn } from '@/lib/utils'
import { PROVIDER_LABELS } from '@/lib/mission-control/constants'

interface RuntimeBadgeProps {
  provider?: string | null
  className?: string
}

export function RuntimeBadge({ provider, className }: RuntimeBadgeProps) {
  const label = provider ? PROVIDER_LABELS[provider] || provider : 'Dedicated'

  return (
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded font-medium',
        'bg-blue-500/10 text-blue-400 border border-blue-500/20',
        className
      )}
    >
      {label}
    </span>
  )
}
