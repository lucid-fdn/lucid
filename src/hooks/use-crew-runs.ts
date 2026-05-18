'use client'

import { useMemo, useCallback } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { CrewRun } from '@contracts/crew'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'

const CREW_RUNS_POLL_INTERVAL = 10_000

interface UseCrewRunsResult {
  runs: CrewRun[]
  isLoading: boolean
  refetch: () => void
  startRun: (triggerType?: string) => Promise<{ run_id: string } | null>
}

export function useCrewRuns(
  crewId: string | null,
  orgId: string,
  projectId?: string | null,
): UseCrewRunsResult {
  const subscriptions: RealtimeSubscription[] = useMemo(
    () =>
      crewId
        ? [
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
    if (!crewId) return async () => [] as CrewRun[]
    return async (): Promise<CrewRun[]> => {
      const params = new URLSearchParams({ org_id: orgId })
      if (projectId) params.set('project_id', projectId)

      const res = await fetch(`/api/crews/${crewId}/runs?${params.toString()}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.runs ?? []
    }
  }, [crewId, orgId, projectId])

  const { data, refetch, isLoading } = useRealtimeQuery<CrewRun[]>({
    queryFn,
    realtimeConfig: {
      channelName: `crew-runs-${crewId ?? 'none'}`,
      subscriptions,
      orgId,
    },
    initialData: [],
    enabled: !!crewId,
    pollInterval: CREW_RUNS_POLL_INTERVAL,
  })

  const startRun = useCallback(
    async (triggerType: string = 'manual') => {
      if (!crewId) return null
      try {
        const res = await fetch(`/api/crews/${crewId}/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: orgId,
            project_id: projectId ?? undefined,
            trigger_type: triggerType,
          }),
        })
        if (!res.ok) return null
        const result = await res.json()
        refetch()
        return result as { run_id: string }
      } catch {
        return null
      }
    },
    [crewId, orgId, projectId, refetch],
  )

  return {
    runs: data,
    isLoading,
    refetch,
    startRun,
  }
}
