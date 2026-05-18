'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { Crown, Play, Users } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useCrewDetail } from '@/hooks/use-crew-detail'
import { useCrewRuns } from '@/hooks/use-crew-runs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PanelLayout, PanelEmptyState, PanelDetailBlock } from '@/components/panels/panel-layout'
import { buildProjectTeamDetailPath, buildProjectTeamsPath } from '@/lib/projects/urls'
import { cn } from '@/lib/utils'
import { notificationCopy } from '@/lib/notifications/copy'

const TEAM_STATUS_STYLES: Record<string, string> = {
  draft: 'text-muted-foreground',
  active: 'text-emerald-400',
  paused: 'text-amber-400',
  completed: 'text-blue-400',
  archived: 'text-muted-foreground',
}

export function AgentTeamPanel({
  assistantId,
  crewId,
  orgId,
  projectId,
  workspaceSlug,
  projectSlug,
}: {
  assistantId: string
  crewId?: string | null
  orgId: string
  projectId?: string | null
  workspaceSlug: string
  projectSlug?: string | null
}) {
  const { topology } = useCrewDetail(crewId ?? null, orgId, projectId)
  const { runs, startRun } = useCrewRuns(crewId ?? null, orgId, projectId)
  const [isStarting, startRunTransition] = useTransition()
  const [isOpening, setIsOpening] = useState(false)

  const teamsHref = projectSlug
    ? buildProjectTeamsPath(workspaceSlug, projectSlug)
    : null
  const teamHref = crewId && projectSlug ? buildProjectTeamDetailPath(workspaceSlug, projectSlug, crewId) : null

  const members = topology?.members ?? []
  const crew = topology?.crew ?? null
  const coordinator = useMemo(
    () => members.find((member) => member.is_coordinator) ?? null,
    [members],
  )
  const activeRun = runs.find((run) => run.status === 'starting' || run.status === 'running') ?? null

  if (!crewId) {
    return (
      <PanelLayout context="Agents can work solo or as part of a coordinated multi-agent team.">
        <PanelEmptyState
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          title="Standalone agent"
          description="This agent is not assigned to a team. Most agents can stay independent until you need coordinator-led execution."
          hint={teamsHref ? 'Add it to a team from the Teams page when you need orchestration.' : undefined}
        >
          {teamsHref ? (
            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
              <Link href={teamsHref}>Open teams</Link>
            </Button>
          ) : null}
        </PanelEmptyState>
      </PanelLayout>
    )
  }

  if (!crew) {
    return (
      <PanelLayout context="Loads the team this agent belongs to, including coordinator role and recent runs.">
        <PanelEmptyState
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          title="Loading team"
          description="Fetching team membership and recent run activity."
        />
      </PanelLayout>
    )
  }

  return (
    <PanelLayout
      context="This agent is part of a team. Team runs start from the coordinator and fan out to members through crew orchestration."
      action={
        <div className="flex flex-wrap gap-2">
          {teamHref ? (
            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
              <Link href={teamHref} onClick={() => setIsOpening(true)}>
                {isOpening ? 'Opening...' : 'Open team'}
              </Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={Boolean(activeRun) || crew.status === 'archived' || isStarting}
            onClick={() => {
              startRunTransition(async () => {
                const result = await startRun()
                if (!result) {
                  toast.error(notificationCopy.team.failedToStartRun)
                  return
                }
                toast.success(notificationCopy.team.runStarted)
              })
            }}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {isStarting ? 'Starting...' : activeRun ? 'Run active' : 'Start run'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <PanelDetailBlock>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Team</p>
          <p className="mt-1 text-sm font-medium text-foreground">{crew.name}</p>
          <p className={cn('mt-1 text-[10px] font-medium uppercase tracking-wide', TEAM_STATUS_STYLES[crew.status] ?? 'text-muted-foreground')}>
            {crew.status}
          </p>
        </PanelDetailBlock>
        <PanelDetailBlock>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coordinator</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {coordinator?.assistant_name ?? 'Unset'}
          </p>
        </PanelDetailBlock>
        <PanelDetailBlock>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Runs</p>
          <p className="mt-1 text-sm font-medium text-foreground">{runs.length}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {activeRun ? `Active: ${activeRun.status}` : runs[0] ? `Last: ${runs[0].status}` : 'No runs yet'}
          </p>
        </PanelDetailBlock>
      </div>

      <PanelDetailBlock>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Objective</p>
        <p className="mt-1 text-xs text-muted-foreground">{crew.objective}</p>
      </PanelDetailBlock>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Members ({members.length})
        </p>
        {members.length === 0 ? (
          <PanelEmptyState
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            title="No members"
            description="This team does not have any active members yet."
          />
        ) : (
          <div className="space-y-2">
            {members.slice(0, 5).map((member) => (
              <PanelDetailBlock key={member.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {member.assistant_name ?? member.member_ref_id.slice(0, 8)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{member.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.is_coordinator ? (
                      <Badge className="h-5 bg-amber-500/15 text-[9px] text-amber-400">
                        <Crown className="mr-1 h-3 w-3" />
                        Coordinator
                      </Badge>
                    ) : null}
                    {member.assistant_id === assistantId ? (
                      <Badge variant="outline" className="h-5 border-border text-[9px] text-muted-foreground">
                        You
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </PanelDetailBlock>
            ))}
            {members.length > 5 && (
              <p className="text-[10px] text-muted-foreground">
                {members.length - 5} more member{members.length - 5 === 1 ? '' : 's'} in this team.
              </p>
            )}
          </div>
        )}
      </div>
    </PanelLayout>
  )
}
