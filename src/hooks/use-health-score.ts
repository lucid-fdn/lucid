'use client'

/**
 * Mission Control — Agent Health Score Hook
 *
 * Fetches the latest health score for a specific agent via useRealtimeQuery.
 * Subscribes to mc_agent_health_scores changes for instant updates when
 * the hourly health computation completes.
 */

import { useMemo } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'

export interface AgentHealthScore {
  overall_score: number
  dimension_scores: Record<string, number>
  fleet_percentile: number | null
  computed_at: string
}

interface UseHealthScoreOptions {
  enabled?: boolean
  live?: boolean
}

export function useHealthScore(agentId: string | null, orgId: string, options: UseHealthScoreOptions = {}) {
  const { enabled = true, live = true } = options
  const subscriptions: RealtimeSubscription[] = useMemo(() => {
    if (!agentId) return []
    return [
      { table: 'mc_agent_health_scores', events: ['INSERT'] as const },
    ]
  }, [agentId])

  const queryFn = useMemo(() => {
    return async (): Promise<AgentHealthScore | null> => {
      if (!agentId) return null
      const res = await fetch(
        `/api/mission-control/agents/${agentId}?org_id=${orgId}&include=health`
      )
      if (!res.ok) return null
      const json = await res.json()
      const health = json.health_score as Record<string, unknown> | undefined
      if (!health) return null
      return {
        overall_score: Number(health.overall_score ?? 0),
        dimension_scores: (health.dimension_scores ?? {}) as Record<string, number>,
        fleet_percentile: health.fleet_percentile != null ? Number(health.fleet_percentile) : null,
        computed_at: (health.computed_at ?? '') as string,
      }
    }
  }, [agentId, orgId])

  const { data, realtimeStatus, refetch } = useRealtimeQuery<AgentHealthScore | null>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-health-${agentId ?? 'none'}`,
      subscriptions,
      orgId,
    },
    initialData: null,
    enabled: enabled && !!agentId,
    liveEnabled: live,
    pollInterval: 60_000,
  })

  return { data, loading: false, error: null, refetch, realtimeStatus }
}
