'use client'

/**
 * Agent Thinking Banner
 *
 * State-aware processing indicator for the chat panel header.
 * Uses centralized state config from mission-control/constants
 * and the shared BreathingDot primitive.
 */

import { cn } from '@/lib/utils'
import { Brain, Zap } from 'lucide-react'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { PRESENCE_STATE_CONFIG } from '@/lib/mission-control/constants'
import { getPresenceLabel } from '@/lib/expressions'
import type { ChatStatus } from '@/lib/mission-control/types'

/** Map chat status → presence state for config lookup */
const STATUS_TO_PRESENCE = {
  submitted: 'thinking',
  streaming: 'responding',
} as const

const STATUS_ICONS = {
  submitted: Brain,
  streaming: Zap,
} as const

interface AgentThinkingBannerProps {
  status: ChatStatus
  agentId?: string
  label?: string
  className?: string
}

export function AgentThinkingBanner({ status, agentId, label: statusLabel, className }: AgentThinkingBannerProps) {
  if (status === 'ready' || status === 'error') return null

  const presenceState = STATUS_TO_PRESENCE[status]
  const config = PRESENCE_STATE_CONFIG[presenceState]
  const Icon = STATUS_ICONS[status]
  const label = statusLabel || getPresenceLabel(presenceState, agentId)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BreathingDot color={config.dotColor} animate size="xs" />
      <Icon className={cn('h-3 w-3', config.textColor)} />
      <span className={cn('text-xs font-medium animate-pulse', config.textColor)}>
        {label.endsWith('...') || label.endsWith('…') ? label : `${label}...`}
      </span>
    </div>
  )
}
