import { searchAgents, type AgentSearchResult } from '@/lib/oracle/api'
import { AgentsClient } from './agents-client'

export default async function AgentsPage() {
  let initialAgents: AgentSearchResult[] = []
  try {
    const result = await searchAgents({ limit: 50, q: '*', sort: 'smart' })
    initialAgents = result.data
  } catch (err) {
    console.error('[oracle/agents] Failed to fetch agents:', (err as Error).message)
  }

  return <AgentsClient initialAgents={initialAgents} />
}
