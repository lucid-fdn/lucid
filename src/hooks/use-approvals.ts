'use client'

/**
 * Mission Control — Approvals Hook
 *
 * Subscribes to pending approvals via Supabase Realtime (postgres_changes).
 * Falls back to polling when Realtime is disconnected.
 *
 * Listens for INSERT + UPDATE on mc_pending_approvals:
 *   - INSERT: new approval request → refetch
 *   - UPDATE: resolved (approved/denied/expired) → optimistic removal
 */

import { useCallback, useMemo } from 'react'
import { FEED_POLL_INTERVAL } from '@/lib/mission-control/constants'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { RealtimePayload, RealtimeSubscription } from '@/hooks/use-supabase-realtime'
import type { PendingApproval } from '@/lib/mission-control/types'

interface UseApprovalsOptions {
  orgId: string
  initialApprovals?: PendingApproval[]
  enabled?: boolean
}

export function useApprovals({
  orgId,
  initialApprovals = [],
  enabled = true,
}: UseApprovalsOptions) {
  const subscriptions: RealtimeSubscription[] = useMemo(() => [
    {
      table: 'mc_pending_approvals',
      events: ['INSERT', 'UPDATE'],
      filter: `org_id=eq.${orgId}`,
    },
  ], [orgId])

  const queryFn = useMemo(() => {
    return async (): Promise<PendingApproval[]> => {
      const res = await fetch(`/api/mission-control/approvals?org_id=${orgId}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.approvals ?? []
    }
  }, [orgId])

  const onRealtimeEvent = useCallback(
    (payload: RealtimePayload, setData: React.Dispatch<React.SetStateAction<PendingApproval[]>>) => {
      if (payload.eventType === 'UPDATE') {
        const newStatus = payload.new?.status as string
        if (newStatus && newStatus !== 'pending') {
          // Resolved — optimistic removal, skip refetch
          const resolvedId = payload.new?.id as string
          if (resolvedId) {
            setData((prev) => prev.filter((a) => a.id !== resolvedId))
          }
          return false
        }
      }
      // INSERT or pending UPDATE — refetch
    },
    []
  )

  const { data: approvals, setData: setApprovals, realtimeStatus, refetch } =
    useRealtimeQuery<PendingApproval[]>({
      queryFn,
      realtimeConfig: {
        channelName: `mc-approvals-${orgId}`,
        subscriptions,
        orgId,
      },
      initialData: initialApprovals,
      enabled,
      pollInterval: FEED_POLL_INTERVAL,
      onRealtimeEvent,
    })

  // Resolve actions
  const resolve = useCallback(async (approvalId: string, action: 'approved' | 'denied') => {
    try {
      const res = await fetch(`/api/mission-control/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        // Optimistic removal
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId))
      }
      return res.ok
    } catch {
      return false
    }
  }, [setApprovals])

  const approve = useCallback((id: string) => resolve(id, 'approved'), [resolve])
  const deny = useCallback((id: string) => resolve(id, 'denied'), [resolve])

  return {
    approvals,
    approve,
    deny,
    realtimeStatus,
    refetch,
  }
}
