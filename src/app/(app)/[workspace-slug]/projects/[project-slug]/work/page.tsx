import React from 'react'
import { notFound } from 'next/navigation'
import { BriefcaseBusiness, Clock3, GitBranch, Kanban, Link2, LoaderCircle, ShieldCheck, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUserId } from '@/lib/auth/server-utils'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { buildProjectWorkDetailPath, buildProjectWorkPath } from '@/lib/projects/urls'
import { getProjectWorkData } from '@/lib/projects/work'
import { WorkItemsClient } from '../../../mission-control/work/work-items-client'
import { ProjectWorkComposer } from '@/components/work/project-work-composer'
import { WorkGraphBoardPanel } from '@/components/work/work-graph-board-panel'
import { WorkGraphPlannerPanel } from '@/components/work/work-graph-planner-panel'

export default async function ProjectWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  const { workspace, project } = scope
  const work = await getProjectWorkData(workspace.id, project.id)
  const workSummary = {
    ready: work.summary?.ready ?? 0,
    claimed: work.summary?.claimed ?? 0,
    blocked: work.summary?.blocked ?? 0,
    stalled: work.summary?.stalled ?? 0,
    overdue: work.summary?.overdue ?? 0,
    approvals: work.summary?.approvals ?? 0,
  }
  const workItems = work.items ?? []
  const workAgentIds = work.agentIds ?? []
  const workAgents = work.agents ?? []
  const workGraphBoards = work.workGraphBoards ?? []
  const pmFederation = work.pmFederation ?? []
  const workGraph = {
    goals: work.workGraph?.goals ?? [],
    boards: work.workGraph?.boards ?? [],
    openCheckouts: work.workGraph?.openCheckouts ?? [],
    planningJobs: work.workGraph?.planningJobs ?? [],
    recentEvents: work.workGraph?.recentEvents ?? [],
  }
  const composerParam = resolvedSearchParams.composer
  const selectedAgentParam = resolvedSearchParams.agentId
  const shouldAutoOpenComposer =
    composerParam === 'open' || (Array.isArray(composerParam) && composerParam.includes('open'))
  const selectedAgentId =
    typeof selectedAgentParam === 'string'
      ? selectedAgentParam
      : Array.isArray(selectedAgentParam)
        ? selectedAgentParam[0] ?? null
        : null
  const sourceParam = resolvedSearchParams.source
  const source =
    typeof sourceParam === 'string'
      ? sourceParam
      : Array.isArray(sourceParam)
        ? sourceParam[0] ?? null
        : null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border text-muted-foreground">
            Project
          </Badge>
          <Badge className="bg-primary/10 text-primary">
            Work
          </Badge>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Work</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review approvals, tickets, and workflow steps that require operator action.
          </p>
        </div>
        <ProjectWorkComposer
          orgId={workspace.id}
          workspaceSlug={workspaceSlug}
          projectSlug={project.slug}
          agents={workAgentIds.map((agentId) => {
            const agent = workAgents.find((item) => item.id === agentId)
            return {
              id: agentId,
              name: agent?.name ?? 'Unnamed agent',
            }
          })}
          triggerLabel={workItems.length === 0 ? 'Create first work item' : 'Create work item'}
          autoOpen={shouldAutoOpenComposer}
          initialSelectedAgentId={selectedAgentId}
          source={source}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ready Now</CardDescription>
            <CardTitle className="text-2xl">{workSummary.ready}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Operator-ready work items that can be claimed immediately
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Claimed</CardDescription>
            <CardTitle className="text-2xl">{workSummary.claimed}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Already claimed and actively being resolved
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Blocked / Waiting</CardDescription>
            <CardTitle className="text-2xl">{workSummary.blocked}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Items held back by upstream execution or an explicit wait state
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stalled / Overdue</CardDescription>
            <CardTitle className="text-2xl">
              {workSummary.stalled} / {workSummary.overdue}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Stalled claimed work and overdue items
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Work Graph</CardTitle>
          <CardDescription>
            Goals, Kanban boards, ownership, and planning state connected to this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Target className="h-4 w-4" />
                Goals
              </div>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {workGraph.goals.length}
              </Badge>
            </div>
            {workGraph.goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No goals are linked yet.</p>
            ) : (
              <div className="space-y-2">
                {workGraph.goals.slice(0, 4).map((goal) => (
                  <div key={goal.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium text-foreground">{goal.title}</p>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {goal.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {goal.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{goal.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Kanban className="h-4 w-4" />
                Boards
              </div>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {workGraph.boards.length}
              </Badge>
            </div>
            {workGraph.boards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No board projection is configured yet.</p>
            ) : (
              <div className="space-y-2">
                {workGraph.boards.slice(0, 4).map((board) => (
                  <div key={board.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium text-foreground">{board.name}</p>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {board.kind}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Source: {board.source}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <GitBranch className="h-4 w-4" />
                Execution State
              </div>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {workGraph.openCheckouts.length} active
              </Badge>
            </div>
            <div className="grid gap-2">
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium text-foreground">{workGraph.planningJobs.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Recent planning jobs</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium text-foreground">{workGraph.recentEvents.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Recent graph events</p>
              </div>
              {workGraph.openCheckouts.slice(0, 2).map((checkout) => (
                <div key={checkout.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium text-foreground">{checkout.purpose}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {checkout.owner_kind} checkout
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <WorkGraphPlannerPanel
        orgId={workspace.id}
        projectId={project.id}
        initialPlanningJobs={workGraph.planningJobs}
      />

      <Card>
        <CardHeader>
          <CardTitle>Kanban</CardTitle>
          <CardDescription>
            Board projection over canonical Work Graph items, checkouts, and status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkGraphBoardPanel
            orgId={workspace.id}
            projectId={project.id}
            initialBoards={workGraphBoards}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PM Federation</CardTitle>
          <CardDescription>
            External PM tools mirror the shared Work Graph through provider modes and field ownership.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pmFederation.length === 0 ? (
            <p className="text-sm text-muted-foreground">No external PM provider is connected for this workspace yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {pmFederation.map((provider) => (
                <div key={provider.provider} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Link2 className="h-4 w-4" />
                        <span className="truncate capitalize">{provider.provider}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {provider.mode.replace('_', ' ')}
                      </p>
                    </div>
                    <Badge variant={provider.enabled && provider.supported ? 'default' : 'outline'}>
                      {provider.enabled && provider.supported ? 'active' : provider.supported ? 'paused' : 'reserved'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      {provider.conflictState.replace('_', ' ')}
                    </Badge>
                    {provider.isPrimary ? (
                      <Badge variant="outline" className="border-border text-muted-foreground">primary</Badge>
                    ) : null}
                  </div>
                  {provider.notes[0] ? (
                    <p className="mt-2 text-xs text-muted-foreground">{provider.notes[0]}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Operator Focus</CardTitle>
            <CardDescription>
              Handle approvals, workflow steps, and tickets without leaving the project.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4" />
                Approval-backed
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {workSummary.approvals > 0
                  ? `${workSummary.approvals} item${workSummary.approvals === 1 ? '' : 's'} are linked to operator approvals.`
                  : 'No approval-backed work items are blocking this project right now.'}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock3 className="h-4 w-4" />
                Stalled
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {workSummary.stalled > 0
                  ? `${workSummary.stalled} claimed or waiting work item${workSummary.stalled === 1 ? '' : 's'} have exceeded the normal operator window.`
                  : 'No stalled work items right now.'}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <LoaderCircle className="h-4 w-4" />
                Ready queue
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {workSummary.ready > 0
                  ? `${workSummary.ready} work item${workSummary.ready === 1 ? '' : 's'} can move immediately with no upstream blocker.`
                  : 'No ready-to-claim project work items right now.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Work Items</CardTitle>
            <CardDescription>
              Deep links into the project-scoped work detail surface.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active work items are linked to this project yet.</p>
            ) : (
              <div className="space-y-3">
                {workItems.slice(0, 6).map((item) => (
                  <a
                    key={item.id}
                    href={buildProjectWorkDetailPath(workspaceSlug, project.slug, item.id)}
                    className="block rounded-lg border p-3 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.signal.detail}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {item.signal.label}
                      </Badge>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4" />
            Project Work Queue
          </CardTitle>
          <CardDescription>
            Scoped to agents currently assigned to {project.name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[calc(100vh-18rem)] min-h-[640px]">
            <WorkItemsClient
              orgId={workspace.id}
              currentUserId={userId}
              agentIds={workAgentIds}
              title="Project Work"
              description="Tickets, approvals, and workflow handoffs tied to agents in this project."
              gateCapability={null}
              detailHrefBase={buildProjectWorkPath(workspaceSlug, project.slug)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
