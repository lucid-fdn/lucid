'use client'

/**
 * Assistant Detail — Live Activity Feed Hook
 *
 * Fetches tool calls, tool results, and errors from /api/assistants/[id]/activity
 * and merges MC feed events (transactions, approvals, etc.) for complete coverage.
 *
 * Messages (inbound/outbound) are excluded — they are noisy and not useful
 * for operational monitoring.
 */

import { useMemo } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'
import type { FeedEvent } from '@/lib/mission-control/types'
import { useOAuthFlowActive } from '@/lib/oauth/flow-state'

interface UseAssistantActivityOptions {
  orgId: string
  assistantId: string
  enabled?: boolean
  live?: boolean
}

export function useAssistantActivity({
  orgId,
  assistantId,
  enabled = true,
  live = true,
}: UseAssistantActivityOptions) {
  const oauthFlowActive = useOAuthFlowActive()
  const subscriptions: RealtimeSubscription[] = useMemo(() => [
    // Subscribe to tables that produce feed-visible events (tool calls, transactions, etc.)
    // Messages (inbound/outbound) removed from feed — noisy and not useful for ops monitoring
    { table: 'trading_transactions', events: ['INSERT', 'UPDATE'] as const },
    { table: 'mc_pending_approvals', events: ['INSERT'] as const },
  ], [])

  const queryFn = useMemo(() => {
    return async (): Promise<FeedEvent[]> => {
      const [activityRes, feedRes] = await Promise.all([
        fetch(`/api/assistants/${assistantId}/activity?limit=50`),
        fetch(`/api/mission-control/feed?org_id=${orgId}&agent_id=${assistantId}&limit=50`),
      ])

      const messageEvents: FeedEvent[] = activityRes.ok
        ? (await activityRes.json()).events ?? []
        : []

      const channelEvents: FeedEvent[] = feedRes.ok
        ? (await feedRes.json()).events ?? []
        : []

      // Merge + deduplicate by id, sort chronologically
      const merged = new Map<string, FeedEvent>()
      for (const e of messageEvents) merged.set(e.id, e)
      for (const e of channelEvents) merged.set(e.id, e)

      const sorted = Array.from(merged.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )

      // Keep last 100 events
      return sorted.slice(-100)
    }
  }, [orgId, assistantId])

  const { data: events, isLoading, realtimeStatus, refetch } = useRealtimeQuery<FeedEvent[]>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-activity-${assistantId}`,
      subscriptions,
      orgId,
    },
    initialData: [],
    enabled: enabled && !oauthFlowActive,
    liveEnabled: live && !oauthFlowActive,
    pollInterval: 3_000,
  })

  return {
    events,
    isLoading,
    // Realtime status reflects the WebSocket push channel, not agent health.
    // When Realtime is unavailable (no token, network issue), the hook falls
    // back to polling — the agent is still connected and processing messages.
    connected: true,
    realtimeStatus,
    refetch,
  }
}
