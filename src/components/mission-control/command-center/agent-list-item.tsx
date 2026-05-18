'use client'

import { cn } from '@/lib/utils'
import { StatusBadge } from '../status-badge'
import { RuntimeBadge } from '../runtime-badge'
import { CapabilityGate } from '../capability-gate'
import { RISK_BADGE_VARIANTS } from '@/lib/mission-control/constants'
import { getVibeStatusLabel } from '@/lib/expressions'
import type { MCAgent } from '@/lib/mission-control/types'

interface AgentListItemProps {
  agent: MCAgent
  selected: boolean
  onSelect: (agentId: string) => void
}

export function AgentListItem({ agent, selected, onSelect }: AgentListItemProps) {
  return (
    <button
      onClick={() => onSelect(agent.id)}
      className={cn(
        'w-full text-left p-3 rounded-lg transition-colors',
        'hover:bg-accent/50',
        selected && 'bg-accent border border-border'
      )}
    >
      <div className="flex items-center gap-2.5">
        <StatusBadge
          status={agent.status}
          hasErrors={agent.errors_last_hour > 0}
          agentId={agent.id}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{agent.name}</span>
            {agent.status === 'paused' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-medium">
                {getVibeStatusLabel('paused', agent.id)}
              </span>
            )}
            {agent.runtime && (
              <CapabilityGate capability="runtime:dedicated">
                <RuntimeBadge provider={agent.runtime.runtimeProvider} />
              </CapabilityGate>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{agent.lucid_model}</span>
            {agent.errors_last_hour > 0 && (
              <span className="text-red-400">
                {agent.errors_last_hour} err{agent.errors_last_hour > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded border font-medium',
            RISK_BADGE_VARIANTS[agent.risk_level]
          )}
        >
          {agent.risk_level.toUpperCase()}
        </span>
      </div>
    </button>
  )
}
