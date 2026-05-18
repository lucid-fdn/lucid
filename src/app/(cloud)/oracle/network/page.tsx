import { ORACLE_API_URL, ORACLE_API_KEY } from '@/lib/oracle/config'
import { AgentCosmos } from '@/components/oracle/agent-cosmos'
import type { GraphSnapshot } from '@/hooks/use-oracle-realtime'

async function fetchCosmosData(): Promise<GraphSnapshot> {
  const empty: GraphSnapshot = {
    nodes: [],
    links: [],
    meta: { totalAgents: 0, activeAgents: 0, totalConnections: 0, chainCounts: {}, computedAt: '' },
  }

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }
    if (ORACLE_API_KEY) {
      headers['x-api-key'] = ORACLE_API_KEY
    }

    const res = await fetch(
      `${ORACLE_API_URL}/v1/oracle/agents/graph?limit=500`,
      {
        headers,
        next: { revalidate: 60 },
      },
    )

    if (!res.ok) return empty

    const json = await res.json()
    const snapshot = json.data ?? json

    // The Oracle API now returns GraphSnapshot format directly
    if (snapshot.nodes && snapshot.links && snapshot.meta) {
      return snapshot as GraphSnapshot
    }

    // Backward compat: old edge format (data: AgentGraphEdge[])
    const edges = Array.isArray(json.data) ? json.data : []
    if (edges.length === 0) return empty

    // Build snapshot from edges
    const nodeMap = new Map<string, GraphSnapshot['nodes'][number]>()
    for (const e of edges) {
      if (!nodeMap.has(e.from_agent)) {
        nodeMap.set(e.from_agent, {
          id: e.from_agent,
          name: e.from_name ?? null,
          chain: e.from_chain ?? 'base',
          reputation: e.from_reputation ?? null,
          txCount: 0,
          portfolioUsd: 0,
          active: true,
        })
      }
      if (!nodeMap.has(e.to_agent)) {
        nodeMap.set(e.to_agent, {
          id: e.to_agent,
          name: e.to_name ?? null,
          chain: e.to_chain ?? 'base',
          reputation: e.to_reputation ?? null,
          txCount: 0,
          portfolioUsd: 0,
          active: true,
        })
      }
      nodeMap.get(e.from_agent)!.txCount += e.tx_count
      nodeMap.get(e.to_agent)!.txCount += e.tx_count
    }

    const nodes = Array.from(nodeMap.values())
    const links = edges.map((e: Record<string, unknown>) => ({
      source: e.from_agent as string,
      target: e.to_agent as string,
      value: e.tx_count as number,
      usd: (e.total_usd as number) ?? 0,
    }))

    const chainCounts: Record<string, number> = {}
    for (const n of nodes) {
      chainCounts[n.chain] = (chainCounts[n.chain] ?? 0) + 1
    }

    return {
      nodes,
      links,
      meta: {
        totalAgents: nodes.length,
        activeAgents: nodes.length,
        totalConnections: links.length,
        chainCounts,
        computedAt: new Date().toISOString(),
      },
    }
  } catch {
    return {
      nodes: [],
      links: [],
      meta: { totalAgents: 0, activeAgents: 0, totalConnections: 0, chainCounts: {}, computedAt: '' },
    }
  }
}

export default async function NetworkPage() {
  const snapshot = await fetchCosmosData()
  return (
    <div
      className="-mt-8 -mb-8 overflow-hidden"
      style={{
        width: '100vw',
        height: 'calc(100vh - 56px)',
        marginLeft: 'calc(-50vw + 50%)',
      }}
    >
      <AgentCosmos initialSnapshot={snapshot} />
    </div>
  )
}
