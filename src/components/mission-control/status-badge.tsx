'use client'

import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/mission-control/constants'
import { getStatusLabel } from '@/lib/expressions'
import type { AgentStatus } from '@/lib/mission-control/types'

interface StatusBadgeProps {
  status: AgentStatus
  hasErrors?: boolean
  agentId?: string
  className?: string
}

export function StatusBadge({ status, hasErrors, agentId, className }: StatusBadgeProps) {
  const color = hasErrors
    ? STATUS_COLORS.error
    : STATUS_COLORS[status] || STATUS_COLORS.idle

  const label = hasErrors
    ? getStatusLabel('error', agentId)
    : getStatusLabel(status, agentId)

  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 rounded-full flex-shrink-0', color, className)}
      title={label}
    />
  )
}
