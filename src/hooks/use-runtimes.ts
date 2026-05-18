'use client'

import { useMemo } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import { RUNTIME_POLL_INTERVAL } from '@/lib/mission-control/constants'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'

interface UseRuntimesOptions {
  enabled?: boolean
  live?: boolean
}

export function useRuntimes(orgId: string, options: UseRuntimesOptions = {}) {
  const { enabled = true, live = true } = options
  const subscriptions: RealtimeSubscription[] = useMemo(
    () => [
      {
        table: 'dedicated_runtimes',
        events: ['INSERT', 'UPDATE', 'DELETE'] as const,
        filter: `org_id=eq.${orgId}`,
      },
    ],
    [orgId]
  )

  const queryFn = useMemo(() => {
    return async (): Promise<DedicatedRuntime[]> => {
      const res = await fetch(`/api/runtimes?org_id=${orgId}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.runtimes ?? []
    }
  }, [orgId])

  const { data: runtimes, refetch } = useRealtimeQuery<DedicatedRuntime[]>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-runtimes-${orgId}`,
      subscriptions,
      orgId,
    },
    initialData: [],
    pollInterval: RUNTIME_POLL_INTERVAL,
    enabled: enabled && !!orgId,
    liveEnabled: live,
  })

  return { runtimes, refetch }
}
