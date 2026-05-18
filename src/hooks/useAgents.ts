import { useMemo } from 'react';
import { availableAgents, getAgents } from '@/constants/agents';
import { useQueryWithCache } from './useQueryWithCache';

interface SuggestionDataItem {
  id: string | number;
  display?: string;
}

export interface AgentSuggestion extends SuggestionDataItem {
  image: string;
  type: 'agent';
}

export function useAgents() {
  // Fetch agents from API with caching
  const { data: apiAgents = [], isLoading, error } = useQueryWithCache({
    cacheKey: 'agent_list' as const,
    queryKey: ['agents'],
    queryFn: getAgents,
  });

  // Memoize the full agent list (combine local and API agents)
  const agents = useMemo(() => {
    // If API agents are available, use them
    if (apiAgents.length > 0) {
      return apiAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        image: agent.image,
        description: agent.description,
        ui: {
          placeholder: `Ask me about ${agent.role.toLowerCase()}...`
        }
      }));
    }
    // Fallback to local agents
    return availableAgents;
  }, [apiAgents]);

  // Memoize the mention-formatted agent list
  const agentMentions = useMemo(() => 
    agents.map((agent) => ({
      id: agent.id,
      display: agent.name,
      image: agent.image,
      type: 'agent' as const
    })), 
    [agents]
  );

  // Memoize the agent map for quick lookups
  const agentMap = useMemo(() => 
    new Map(agents.map(agent => [agent.id, agent])),
    [agents]
  );

  return {
    agents,
    agentMentions,
    agentMap,
    getAgentById: (id: string) => agentMap.get(id),
    isLoading,
    error
  };
}
