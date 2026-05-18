'use client'

import { useMemo } from 'react'

import type { Agent } from '@/types/agent'
import type { AgentsStatusFilter } from './agents-list-types'

export function useAgentListFilters({
  agents,
  searchQuery,
  statusFilter,
}: {
  agents: Agent[]
  searchQuery: string
  statusFilter: AgentsStatusFilter
}) {
  return useMemo(() => {
    let result = agents

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (agent) =>
          agent.name.toLowerCase().includes(q) ||
          agent.lucid_model.toLowerCase().includes(q) ||
          agent.system_prompt?.toLowerCase().includes(q),
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter((agent) =>
        statusFilter === 'active' ? agent.is_active : !agent.is_active,
      )
    }

    return result
  }, [agents, searchQuery, statusFilter])
}

