'use client'

/**
 * Agent Presence Indicator
 *
 * Shows agent "aliveness" — breathing dot + state label + relative time.
 * Reusable across assistant detail, Mission Control fleet view, etc.
 *
 * Uses centralized state config from mission-control/constants
 * and the shared BreathingDot UI primitive.
 */

import { cn } from '@/lib/utils'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { PRESENCE_STATE_CONFIG } from '@/lib/mission-control/constants'
import { getPresenceLabel } from '@/lib/expressions'
import type { AgentPresenceState } from '@/lib/mission-control/types'

interface AgentPresenceIndicatorProps {
  state: AgentPresenceState
  lastActivityLabel: string
  connected?: boolean
  agentId?: string
  className?: string
}

export function AgentPresenceIndicator({
  state,
  lastActivityLabel,
  connected = true,
  agentId,
  className,
}: AgentPresenceIndicatorProps) {
  if (!connected) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <BreathingDot color="bg-red-500" />
        <span className="text-[11px] text-red-400 font-medium">Disconnected</span>
      </div>
    )
  }

  const config = PRESENCE_STATE_CONFIG[state]
  const label = getPresenceLabel(state, agentId)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BreathingDot color={config.dotColor} animate={config.breathe} />

      <span className={cn('text-[11px] font-medium transition-colors duration-300', config.textColor)}>
        {label}
      </span>

      <span className="text-zinc-700 text-[11px]">&middot;</span>

      <span className="text-[11px] text-zinc-600">{lastActivityLabel}</span>
    </div>
  )
}
