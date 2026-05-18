'use client'

import useSWR from 'swr'

// ── Types (mirror Oracle API GraphSnapshot) ──────────────────

export interface GraphSnapshotNode {
  id: string
  name: string | null
  chain: string
  reputation: number | null
  txCount: number
  portfolioUsd: number
  active: boolean
}

export interface GraphSnapshotLink {
  source: string
  target: string
  value: number
  usd: number
}

export interface GraphSnapshotMeta {
  totalAgents: number
  activeAgents: number
  totalConnections: number
  chainCounts: Record<string, number>
  computedAt: string
}

export interface GraphSnapshot {
  nodes: GraphSnapshotNode[]
  links: GraphSnapshotLink[]
  meta: GraphSnapshotMeta
}

// ── Fetcher ──────────────────────────────────────────────────

const fetcher = async (url: string): Promise<GraphSnapshot> => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Oracle graph fetch failed: ${res.status}`)
  }
  const json = await res.json()
  // The proxy route returns the snapshot directly at top level
  return json as GraphSnapshot
}

// ── Hook ─────────────────────────────────────────────────────

/**
 * Oracle-scoped graph data hook.
 *
 * Uses SWR to cache the pre-computed graph snapshot and revalidate
 * on a configurable polling interval (default: 5 minutes).
 *
 * This is NOT Supabase Realtime — it polls the oracle proxy route.
 * For Pro tier, the cosmos component could subscribe to SSE for
 * instant graph_updated notifications and then call mutate().
 */
export function useOracleGraph(
  initialData?: GraphSnapshot,
  pollIntervalMs = 300_000,
) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<GraphSnapshot>(
    '/api/oracle/network?view=cosmos&limit=500',
    fetcher,
    {
      fallbackData: initialData,
      refreshInterval: pollIntervalMs,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: !initialData, // Don't refetch on mount if we have SSR data
      revalidateIfStale: false, // SSR data is fresh enough
      dedupingInterval: 60_000,
      keepPreviousData: true,
    },
  )

  return {
    data: data ?? initialData ?? { nodes: [], links: [], meta: { totalAgents: 0, activeAgents: 0, totalConnections: 0, chainCounts: {}, computedAt: '' } },
    isLoading,
    isValidating,
    error: error as Error | undefined,
    mutate,
  }
}
