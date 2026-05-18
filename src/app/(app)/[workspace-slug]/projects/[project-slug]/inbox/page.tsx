import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AlertTriangle, Bot, ChevronRight, Inbox, PlayCircle, ShieldCheck, Users, Workflow } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUserId } from '@/lib/auth/server-utils'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { getProjectAttentionData } from '@/lib/projects/attention'
import {
  buildProjectAgentsPath,
  buildProjectRunsPath,
  buildProjectTeamsPath,
  buildProjectWorkDetailPath,
  buildProjectWorkPath,
} from '@/lib/projects/urls'

function formatEventLabel(eventType: string) {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function InboxHeader() {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-border text-muted-foreground">
          Project
        </Badge>
        <Badge className="bg-primary/10 text-primary">
          Inbox
        </Badge>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The shortest path to what needs attention in this project right now.
        </p>
      </div>
    </div>
  )
}

function InboxLoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <CardDescription>Loading</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground/60">...</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Gathering project attention signals
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Loading approvals and work</CardTitle>
            <CardDescription>
              Streaming the latest inbox state for this project.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Loading failures and next actions</CardTitle>
            <CardDescription>
              The page shell is ready; detailed attention data is still loading.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}

async function ProjectInboxContent({
  workspaceId,
  workspaceSlug,
  projectId,
  projectSlug,
}: {
  workspaceId: string
  workspaceSlug: string
  projectId: string
  projectSlug: string
}) {
  const attention = await getProjectAttentionData(workspaceId, projectId)
  const agentsHref = buildProjectAgentsPath(workspaceSlug, projectSlug)
  const teamsHref = buildProjectTeamsPath(workspaceSlug, projectSlug)
  const runsHref = buildProjectRunsPath(workspaceSlug, projectSlug)
  const workHref = buildProjectWorkPath(workspaceSlug, projectSlug)

  return (
    <>
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approvals</CardDescription>
            <CardTitle className="text-2xl">{attention.summary.approvals}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Pending operator decisions
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed Runs</CardDescription>
            <CardTitle className="text-2xl">{attention.summary.failedRuns}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Run and crew failures needing review
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Team Runs</CardDescription>
            <CardTitle className="text-2xl">{attention.summary.activeRuns}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Currently running or starting
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ready Work</CardDescription>
            <CardTitle className="text-2xl">{attention.summary.readyWorkItems}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Human work items ready for operator action
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Liveness Incidents</CardDescription>
            <CardTitle className="text-2xl">{attention.summary.livenessIncidents}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Stalled, overdue, or orphaned work
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Approvals</CardTitle>
              <CardDescription>
                Pending decisions across agents currently assigned to this project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attention.pendingApprovals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending approvals right now.</p>
              ) : (
                <div className="space-y-3">
                  {attention.pendingApprovals.slice(0, 8).map((approval) => (
                    <div key={approval.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{approval.tool_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{approval.agent_name}</p>
                        </div>
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          {approval.risk_level}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ready Work</CardTitle>
              <CardDescription>
                Operator-ready work items currently linked to agents in this project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attention.readyWorkItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ready human work items are linked to this project.</p>
              ) : (
                <div className="space-y-3">
                  {attention.readyWorkItems.slice(0, 8).map((item) => (
                    <Link
                      key={item.id}
                      href={buildProjectWorkDetailPath(workspaceSlug, projectSlug, item.id)}
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
                    </Link>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <Link href={workHref} className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                  Open work queue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Failures</CardTitle>
              <CardDescription>
                Run and runtime signals that most likely need intervention.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attention.failedEvents.length === 0 && attention.failedCrewRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent failures in this project.</p>
              ) : (
                <div className="space-y-3">
                  {attention.failedCrewRuns.slice(0, 4).map((run) => (
                    <div key={run.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Users className="h-4 w-4 text-red-500" />
                        {run.crewName}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Team run failed</p>
                      {run.error_message ? (
                        <p className="mt-2 text-xs text-red-500">{run.error_message}</p>
                      ) : null}
                    </div>
                  ))}
                  {attention.failedEvents.slice(0, 4).map((event) => (
                    <div key={event.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        {event.agent_name}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatEventLabel(event.event_type)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blocked &amp; Stalled</CardTitle>
              <CardDescription>
                Work items and incidents that need operator escalation, not just a routine claim.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attention.blockedWorkItems.length === 0 && attention.livenessIncidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No blocked or stalled work items right now.</p>
              ) : (
                <div className="space-y-3">
                  {attention.livenessIncidents.slice(0, 4).map((incident) => (
                    <div key={incident.key} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{incident.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{incident.detail}</p>
                        </div>
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          {incident.severity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {attention.blockedWorkItems.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      href={buildProjectWorkDetailPath(workspaceSlug, projectSlug, item.id)}
                      className="block rounded-lg border p-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.signal.detail}</p>
                        </div>
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          {item.signal.label}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next Actions</CardTitle>
              <CardDescription>
                Jump to the project surface most likely to unblock execution.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Link href={runsHref} className="rounded-lg border p-3 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <PlayCircle className="h-4 w-4" />
                  Inspect runs
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Review receipts, failures, and live execution.</p>
              </Link>
              <Link href={agentsHref} className="rounded-lg border p-3 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Bot className="h-4 w-4" />
                  Open agents
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Launch or adjust standalone agents in this project.</p>
              </Link>
              <Link href={teamsHref} className="rounded-lg border p-3 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Users className="h-4 w-4" />
                  Open teams
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Review team coordination, members, and recent outcomes.</p>
              </Link>
              <Link href={workHref} className="rounded-lg border p-3 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Workflow className="h-4 w-4" />
                  Open work queue
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Handle human tasks and workflow-backed work items.</p>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Critical Signals</CardTitle>
              <CardDescription>
                Highest-severity recent events across project agents.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attention.criticalEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No critical events right now.</p>
              ) : (
                <div className="space-y-3">
                  {attention.criticalEvents.slice(0, 6).map((event) => (
                    <div key={event.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <ShieldCheck className="h-4 w-4 text-amber-500" />
                        {event.agent_name}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatEventLabel(event.event_type)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

export default async function ProjectInboxPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } = await params

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  const { workspace, project } = scope

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <InboxHeader />
      <Suspense fallback={<InboxLoadingState />}>
        <ProjectInboxContent
          workspaceId={workspace.id}
          workspaceSlug={workspaceSlug}
          projectId={project.id}
          projectSlug={project.slug}
        />
      </Suspense>
    </div>
  )
}
