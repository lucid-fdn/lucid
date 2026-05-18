import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity, AlertTriangle, Bot, Inbox, MessagesSquare, ShieldCheck, Users } from 'lucide-react'
import type { CrewRun } from '@contracts/crew'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RunNarrativeView } from '@/components/runs/run-narrative-view'
import { requireUserId } from '@/lib/auth/server-utils'
import { getAssistantsByProject, getMCFeedEvents, getPendingApprovals } from '@/lib/db'
import { getProjectResourceCounts } from '@/lib/db/projects'
import { getCrewsByProject, getCrewRuns } from '@/lib/db/crews'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { crewRunsToNarrativeItems, feedEventsToNarrativeItems } from '@/lib/runs/receipts'
import {
  buildProjectAgentsPath,
  buildProjectInboxPath,
  buildWorkspaceMissionControlApprovalsPath,
  buildWorkspaceMissionControlReplayPath,
} from '@/lib/projects/urls'

const RUNS_LINKS = [
  {
    title: 'Inbox',
    description: 'Review approvals, failures, and human work needing attention.',
    href: buildProjectInboxPath,
    icon: Inbox,
  },
  {
    title: 'Fleet Activity',
    description: 'Inspect active agents, health, and orchestration activity.',
    href: buildProjectAgentsPath,
    icon: Bot,
  },
  {
    title: 'Replay',
    description: 'Trace conversations and work execution over time.',
    href: (workspaceSlug: string, _projectSlug: string) => buildWorkspaceMissionControlReplayPath(workspaceSlug),
    icon: MessagesSquare,
  },
  {
    title: 'Approvals',
    description: 'Handle pending approvals and intervention points.',
    href: (workspaceSlug: string, _projectSlug: string) => buildWorkspaceMissionControlApprovalsPath(workspaceSlug),
    icon: ShieldCheck,
  },
]

const RUN_STATUS_STYLES: Record<string, string> = {
  starting: 'bg-amber-500/15 text-amber-500',
  running: 'bg-blue-500/15 text-blue-500',
  completed: 'bg-emerald-500/15 text-emerald-500',
  failed: 'bg-red-500/15 text-red-500',
  cancelled: 'bg-muted text-muted-foreground',
}

function isRunEvent(eventType: string) {
  return (
    eventType.includes('run') ||
    eventType === 'task_completed' ||
    eventType === 'task_failed' ||
    eventType === 'task_cancelled'
  )
}

export default async function ProjectRunsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  const { workspace, project } = scope

  const [counts, assistants, approvals, feedEvents, crews] = await Promise.all([
    getProjectResourceCounts(workspace.id, project.id),
    getAssistantsByProject(workspace.id, project.id),
    getPendingApprovals(workspace.id).catch(() => []),
    getMCFeedEvents(workspace.id, { limit: 50 }).catch(() => []),
    getCrewsByProject(workspace.id, project.id).catch(() => []),
  ])

  const projectAgentIds = new Set(assistants.map((assistant) => assistant.id))
  const projectRunEvents = feedEvents
    .filter((event) => projectAgentIds.has(event.agent_id) && isRunEvent(event.event_type))
    .slice(0, 8)
  const narrativeItems = feedEventsToNarrativeItems(projectRunEvents)

  const crewRunsByCrew = await Promise.all(
    crews.map(async (crew) => ({
      crew,
      runs: await getCrewRuns(crew.id).catch(() => [] as CrewRun[]),
    })),
  )

  const recentCrewRuns = crewRunsByCrew
    .flatMap(({ crew, runs }) =>
      runs.map((run) => ({
        ...run,
        crewName: crew.name,
      })),
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)
  const crewReceiptItems = crewRunsToNarrativeItems(recentCrewRuns)

  const activeCrewRuns = recentCrewRuns.filter((run) => run.status === 'starting' || run.status === 'running').length
  const failedCrewRuns = recentCrewRuns.filter((run) => run.status === 'failed').length

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border text-muted-foreground">
            Project
          </Badge>
          <Badge className="bg-primary/10 text-primary">
            Runs
          </Badge>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Runs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs are the receipts for this project: recent execution, failures, approvals, and next actions.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agents</CardDescription>
            <CardTitle className="text-2xl">{counts.assistants}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Agents available to produce project runs
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Teams</CardDescription>
            <CardTitle className="text-2xl">{counts.crews}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Multi-agent teams configured for this project
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Team Runs</CardDescription>
            <CardTitle className="text-2xl">{activeCrewRuns}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Starting or running right now
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Approvals</CardDescription>
            <CardTitle className="text-2xl">{approvals.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Operator decisions blocking project work
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent Team Runs</CardTitle>
            <CardDescription>
              Multi-agent runs inside this project, ordered from newest to oldest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentCrewRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No team runs yet. Single agents can still work independently, or you can create a team when coordination matters.
              </p>
            ) : (
              <div className="space-y-3">
                {recentCrewRuns.map((run) => (
                  <div key={run.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{run.crewName}</p>
                        <Badge className={RUN_STATUS_STYLES[run.status] ?? RUN_STATUS_STYLES.cancelled}>
                          {run.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Triggered via {run.trigger_type}
                      </p>
                      {run.outcome_summary ? (
                        <p className="mt-2 text-xs text-muted-foreground">{run.outcome_summary}</p>
                      ) : null}
                      {run.error_message ? (
                        <p className="mt-2 text-xs text-red-500">{run.error_message}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(run.created_at).toLocaleString()}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        ${Number(run.total_cost_usd ?? 0).toFixed(4)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Attention Needed</CardTitle>
              <CardDescription>
                The shortest path to unblocking execution in this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Pending approvals
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {approvals.length > 0
                    ? `${approvals.length} approval${approvals.length === 1 ? '' : 's'} waiting for a decision.`
                    : 'No approvals are waiting right now.'}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  Failed team runs
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {failedCrewRuns > 0
                    ? `${failedCrewRuns} recent failed team run${failedCrewRuns === 1 ? '' : 's'} need review.`
                    : 'No recent failed team runs.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deep Operations</CardTitle>
              <CardDescription>
                Use the existing operations surfaces when you need more detail than the project shell provides.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {RUNS_LINKS.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.title} href={item.href(workspaceSlug, project.slug)} className="rounded-lg border p-3 transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Icon className="h-4 w-4" />
                      {item.title}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </Link>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run Activity Feed</CardTitle>
          <CardDescription>
            Recent run and task events from agents currently assigned to this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunNarrativeView
            items={narrativeItems}
            emptyTitle="No run events yet. Start an agent or team run to generate activity here."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team Run Receipts</CardTitle>
          <CardDescription>
            Recent multi-agent run outcomes in the shared narrative format.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunNarrativeView
            items={crewReceiptItems}
            emptyTitle="No team run receipts yet. Start a team run to produce receipt history here."
          />
        </CardContent>
      </Card>
    </div>
  )
}
