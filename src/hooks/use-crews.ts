'use client'

import { useMemo } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { Crew, CrewMember, CrewEdge, Team, TeamEdge, TeamMember } from '@contracts/crew'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'

const CREW_POLL_INTERVAL = 30_000

interface CrewsWithTopology {
  crews: Crew[]
  crewMembers: Record<string, CrewMember[]>
  crewEdges: Record<string, CrewEdge[]>
}

export function useCrews(orgId: string, projectId?: string | null, enabled = true) {
  const queryEnabled = enabled && Boolean(orgId)
  const subscriptions: RealtimeSubscription[] = useMemo(
    () => [
      {
        table: 'crews',
        events: ['INSERT', 'UPDATE', 'DELETE'] as const,
        filter: projectId ? `project_id=eq.${projectId}` : `org_id=eq.${orgId}`,
      },
      {
        table: 'crew_members',
        events: ['INSERT', 'UPDATE', 'DELETE'] as const,
        // Filter via crew_id IN (crews for this org) isn't possible with Realtime,
        // but we scope the refetch to this org anyway — acceptable trade-off.
      },
      {
        table: 'crew_edges',
        events: ['INSERT', 'UPDATE', 'DELETE'] as const,
        // Filter via crew_id IN (crews for this org) isn't possible with Realtime,
        // but we scope the refetch to this org anyway — acceptable trade-off.
      },
    ],
    [orgId, projectId],
  )

  const queryFn = useMemo(() => {
    return async (): Promise<CrewsWithTopology> => {
      // Single request: crews + all members + all edges (batch, not N+1)
      const params = new URLSearchParams({
        org_id: orgId,
        topology: 'true',
      })
      if (projectId) params.set('project_id', projectId)

      const res = await fetch(`/api/crews?${params.toString()}`)
      if (!res.ok) return { crews: [], crewMembers: {}, crewEdges: {} }
      const data = await res.json()
      return {
        crews: data.crews ?? [],
        crewMembers: data.members ?? {},
        crewEdges: data.edges ?? {},
      }
    }
  }, [orgId, projectId])

  const { data, refetch } = useRealtimeQuery<CrewsWithTopology>({
    queryFn,
    realtimeConfig: {
      channelName: `crews-${projectId ?? orgId}`,
      subscriptions,
      orgId,
    },
    initialData: { crews: [], crewMembers: {}, crewEdges: {} },
    enabled: queryEnabled,
    pollInterval: CREW_POLL_INTERVAL,
  })

  return {
    crews: data.crews,
    crewMembers: data.crewMembers,
    crewEdges: data.crewEdges,
    refetch,
  }
}

export function useTeams(orgId: string, projectId?: string | null, enabled = true) {
  const { crews, crewMembers, crewEdges, refetch } = useCrews(orgId, projectId, enabled)

  return {
    teams: crews as Team[],
    teamMembers: crewMembers as Record<string, TeamMember[]>,
    teamEdges: crewEdges as Record<string, TeamEdge[]>,
    refetch,
  }
}

export function useTeam(orgId: string, teamId: string | null | undefined, projectId?: string | null, enabled = true) {
  const { teams, teamMembers, teamEdges, refetch } = useTeams(orgId, projectId, enabled)
  const team = teamId ? teams.find((candidate) => candidate.id === teamId) ?? null : null

  return {
    team,
    members: team ? teamMembers[team.id] ?? [] : [],
    edges: team ? teamEdges[team.id] ?? [] : [],
    refetch,
  }
}
