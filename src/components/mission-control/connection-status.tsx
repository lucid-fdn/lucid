'use client'

import { cn } from '@/lib/utils'
import { getConnectionStatus } from '@/lib/mission-control/types'
import { CONNECTION_STATUS_COLORS } from '@/lib/mission-control/constants'
import { getConnectionLabel } from '@/lib/expressions'

interface ConnectionStatusProps {
  lastSeenAt: string | null
  runtimeId?: string
  className?: string
  showLabel?: boolean
}

export function ConnectionStatus({ lastSeenAt, runtimeId, className, showLabel = false }: ConnectionStatusProps) {
  const status = getConnectionStatus(lastSeenAt)
  const color = CONNECTION_STATUS_COLORS[status]
  const label = getConnectionLabel(status, runtimeId)

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full flex-shrink-0',
          color,
          status === 'connected' && 'animate-pulse'
        )}
        title={label}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </span>
  )
}
