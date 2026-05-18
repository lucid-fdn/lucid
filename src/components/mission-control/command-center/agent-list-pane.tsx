'use client'

import { Bot } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentListItem } from './agent-list-item'
import { EmptyState } from '../empty-state'
import { getEmptyState } from '@/lib/expressions'
import type { MCAgent } from '@/lib/mission-control/types'

interface AgentListPaneProps {
  agents: MCAgent[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
}

export function AgentListPane({ agents, selectedAgentId, onSelectAgent }: AgentListPaneProps) {
  if (agents.length === 0) {
    return (
      <div className="flex-shrink-0 h-full">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Agents</h2>
        </div>
        <EmptyState
          icon={<Bot className="h-8 w-8" />}
          title={getEmptyState('agents').title}
          description={getEmptyState('agents').description}
        />
      </div>
    )
  }

  const activeCount = agents.filter((a) => a.status === 'active').length
  const errorCount = agents.filter((a) => a.errors_last_hour > 0).length

  return (
    <div className="flex-shrink-0 h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Agents</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-green-500">{activeCount} live</span>
            {errorCount > 0 && (
              <span className="text-red-400">{errorCount} err</span>
            )}
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {agents.map((agent) => (
            <AgentListItem
              key={agent.id}
              agent={agent}
              selected={selectedAgentId === agent.id}
              onSelect={onSelectAgent}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
