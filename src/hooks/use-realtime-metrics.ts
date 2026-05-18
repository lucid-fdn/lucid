'use client'

/**
 * Mission Control — Real-time Metrics Hook
 *
 * Overview KPIs (agent counts, approvals, errors, cost) via
 * useRealtimeQuery. Subscribes to ai_assistants and mc_pending_approvals
 * changes so KPIs update instantly on agent status or approval changes.
 */

import { useMemo } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'

export interface RealtimeMetrics {
  total_agents: number
  active_agents: number
  paused_agents: number
  pending_approvals: number
  errors_24h: number
  total_runs_24h: number
  cost_today_usd: number
}

interface UseRealtimeMetricsOptions {
  enabled?: boolean
  live?: boolean
}

export function useRealtimeMetrics(orgId: string, options: UseRealtimeMetricsOptions = {}) {
  const { enabled = true, live = true } = options
  const subscriptions: RealtimeSubscription[] = useMemo(() => [
    { table: 'ai_assistants', events: ['UPDATE'] },
    { table: 'mc_pending_approvals', events: ['INSERT', 'UPDATE'], filter: `org_id=eq.${orgId}` },
  ], [orgId])

  const queryFn = useMemo(() => {
    return async (): Promise<RealtimeMetrics> => {
      const res = await fetch(`/api/mission-control/overview?org_id=${orgId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return {
        total_agents: Number(json.total_agents ?? 0),
        active_agents: Number(json.active_agents ?? 0),
        paused_agents: Number(json.paused_agents ?? 0),
        pending_approvals: Number(json.pending_approvals ?? 0),
        errors_24h: Number(json.errors_24h ?? 0),
        total_runs_24h: Number(json.total_runs_24h ?? 0),
        cost_today_usd: Number(json.cost_today_usd ?? 0),
      }
    }
  }, [orgId])

  const defaultMetrics: RealtimeMetrics = {
    total_agents: 0, active_agents: 0, paused_agents: 0,
    pending_approvals: 0, errors_24h: 0, total_runs_24h: 0, cost_today_usd: 0,
  }

  const { data, realtimeStatus, refetch } = useRealtimeQuery<RealtimeMetrics>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-overview-${orgId}`,
      subscriptions,
      orgId,
    },
    initialData: defaultMetrics,
    pollInterval: 10_000,
    enabled: enabled && !!orgId,
    liveEnabled: live,
  })

  return { data, loading: false, error: null, refetch, realtimeStatus }
}
