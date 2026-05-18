'use client'

/**
 * Mission Control — Live Feed Hook
 *
 * Subscribes to feed events via Supabase Realtime (postgres_changes).
 * Falls back to polling when Realtime is disconnected.
 *
 * On each Realtime event, does a debounced refetch to get the full
 * normalized feed via the mc_feed_events RPC.
 */

import { useMemo } from 'react'
import { FEED_POLL_INTERVAL } from '@/lib/mission-control/constants'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'
import type { FeedEvent } from '@/lib/mission-control/types'

interface UseLiveFeedOptions {
  orgId: string
  agentId?: string
  initialEvents?: FeedEvent[]
  enabled?: boolean
}

export function useLiveFeed({
  orgId,
  agentId,
  initialEvents = [],
  enabled = true,
}: UseLiveFeedOptions) {
  const subscriptions: RealtimeSubscription[] = useMemo(() => [
    // Only subscribe to tables that are part of mc_feed_events_v view.
    { table: 'trading_transactions', events: ['INSERT', 'UPDATE'] },
    { table: 'mc_pending_approvals', events: ['INSERT'] },
    { table: 'mc_approval_log', events: ['INSERT'] },
    { table: 'mc_remediation_log', events: ['INSERT'] },
    { table: 'runtime_events', events: ['INSERT'] },
    { table: 'agent_scheduled_tasks', events: ['INSERT', 'UPDATE'] },
  ], [])

  const queryFn = useMemo(() => {
    return async (): Promise<FeedEvent[]> => {
      const params = new URLSearchParams({ org_id: orgId, limit: '50' })
      if (agentId) params.set('agent_id', agentId)
      const res = await fetch(`/api/mission-control/feed?${params}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.events ?? []
    }
  }, [orgId, agentId])

  const { data: events, isLoading, realtimeStatus, refetch } = useRealtimeQuery<FeedEvent[]>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-feed-${orgId}`,
      subscriptions,
      orgId,
    },
    initialData: initialEvents,
    enabled,
    pollInterval: FEED_POLL_INTERVAL,
  })

  return {
    events,
    isLoading,
    // Feed connection status should NOT drive agent presence.
    // The Realtime WebSocket is a UI optimization (push vs poll) —
    // a missing token or slow connect doesn't mean the agent is offline.
    // Polling fallback keeps the feed functional regardless.
    connected: true,
    realtimeStatus,
    refetch,
  }
}
