import { useMemo } from 'react'
import { useAgents } from './useAgents'
import { DEFAULT_AGENT_ID } from '@/constants/agents'

/**
 * Hook to get a single agent by ID
 * Wraps useAgents for single-agent lookup
 */
export function useAgent(agentId?: string) {
  const { getAgentById, agents, isLoading } = useAgents()

  const agent = useMemo(() => {
    const found = getAgentById(agentId || DEFAULT_AGENT_ID)
    return found || agents[0] || { id: 'unknown', name: 'Agent', image: '/agents/default.png', description: '' }
  }, [agentId, getAgentById, agents])

  return { agent, isLoading }
}
