'use client'

import { useMemo } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { CrewTopology } from '@contracts/crew'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'

const CREW_DETAIL_POLL_INTERVAL = 15_000

export function useCrewDetail(crewId: string | null, orgId: string, projectId?: string | null) {
  const subscriptions: RealtimeSubscription[] = useMemo(
    () =>
      crewId
        ? [
            {
              table: 'crews',
              events: ['UPDATE'] as const,
              filter: `id=eq.${crewId}`,
            },
            {
              table: 'crew_members',
              events: ['INSERT', 'UPDATE', 'DELETE'] as const,
            },
            {
              table: 'crew_edges',
              events: ['INSERT', 'UPDATE', 'DELETE'] as const,
            },
            {
              table: 'crew_runs',
              events: ['INSERT', 'UPDATE'] as const,
              filter: `crew_id=eq.${crewId}`,
            },
          ]
        : [],
    [crewId],
  )

  const queryFn = useMemo(() => {
    if (!crewId) return async (): Promise<CrewTopology | null> => null
    return async (): Promise<CrewTopology | null> => {
      const params = new URLSearchParams({
        org_id: orgId,
        topology: 'true',
      })
      if (projectId) {
        params.set('project_id', projectId)
      }

      const res = await fetch(`/api/crews/${crewId}?${params.toString()}`)
      if (!res.ok) return null
      return res.json()
    }
  }, [crewId, orgId, projectId])

  const { data: topology, refetch } = useRealtimeQuery<CrewTopology | null>({
    queryFn,
    realtimeConfig: {
      channelName: `crew-detail-${crewId ?? 'none'}`,
      subscriptions,
      orgId,
    },
    initialData: null,
    pollInterval: CREW_DETAIL_POLL_INTERVAL,
  })

  return { topology, refetch }
}
