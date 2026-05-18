import React from 'react'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock3, Cpu, GitBranch, Link2, ShieldCheck, Target, Workflow } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformGuaranteesCard } from '@/components/platform/platform-guarantees-card'
import { ContinuationHandoffCard } from '@/components/runs/continuation-handoff-card'
import { ProjectWorkDetailActions } from '@/components/work/project-work-detail-actions'
import { WorkRunLegibilityPanel } from '@/components/work/work-run-legibility-panel'
import { requireUserId } from '@/lib/auth/server-utils'
import { buildProjectWorkDetailPath, buildProjectWorkPath } from '@/lib/projects/urls'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { getProjectWorkDetailData } from '@/lib/projects/work'
import { describeWorkItemBlocker, describeWorkItemEvent, extractRunArtifacts } from '@/lib/projects/work-presentation'
import { deriveFeedContinuation } from '@/lib/runs/continuation'
import { deriveProjectProofLoop } from '@/lib/projects/proof'
import { WorkItemsClient } from '../../../../mission-control/work/work-items-client'

function formatEventLabel(eventType: string) {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default async function ProjectWorkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{
    'workspace-slug': string
    'project-slug': string
    'item-id': string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = await requireUserId()
  const {
    'workspace-slug': workspaceSlug,
    'project-slug': projectSlug,
    'item-id': itemId,
  } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const sourceParam = resolvedSearchParams.source
  const source =
    typeof sourceParam === 'string'
      ? sourceParam
      : Array.isArray(sourceParam)
        ? sourceParam[0] ?? null
        : null

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  const { workspace, project } = scope
  const work = await getProjectWorkDetailData(workspace.id, project.id, itemId)
  if (!work.item) notFound()

  const linkedRunArtifacts = extractRunArtifacts(work.linkedRunEvents)
  const linkedApprovalId =
    work.item.external_mirror &&
    typeof work.item.external_mirror === 'object' &&
    typeof (work.item.external_mirror as Record<string, unknown>).approval_id === 'string'
      ? ((work.item.external_mirror as Record<string, unknown>).approval_id as string)
      : null
  const blockerSummary = describeWorkItemBlocker(work.item, work.dagContext, work.item.signal)
  const continuation = deriveFeedContinuation(work.linkedRunEvents)
  const proofLoop = deriveProjectProofLoop({
    assistantCount: work.agents.length,
    recentEventCount: work.linkedRunEvents.length,
    attention: {
      approvals: linkedApprovalId ? 1 : 0,
      failedRuns: work.linkedRunEvents.some((event) => event.severity === 'error' || event.severity === 'critical') ? 1 : 0,
      openWorkItems: work.items.length,
      readyWorkItems: work.items.filter((item) => item.signal.readyForOperator).length,
    },
    runtimePackaging: {
      uniqueModeCount: 0,
      primaryTitle: null,
      guidance: 'Resolve the work item, inspect the receipt, then decide if runtime posture needs to change.',
    },
  })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border text-muted-foreground">
            Project
          </Badge>
          <Badge className="bg-primary/10 text-primary">
            Work Detail
          </Badge>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Work Detail</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect one work item in project context, alongside the rest of the scoped queue.
          </p>
        </div>
      </div>

      {source === 'create-agent' ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>First Proof</CardTitle>
            <CardDescription>
              {proofLoop.summary}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              href={buildProjectWorkPath(workspaceSlug, project.slug)}
              className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
            >
              Open work queue
            </Link>
            <Link
              href={`/${workspaceSlug}/projects/${project.slug}/runs`}
              className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
            >
              {proofLoop.nextActionTitle === 'Review runs' ? proofLoop.nextActionTitle : 'Review project runs'}
            </Link>
            <Link
              href={`/${workspaceSlug}/projects/${project.slug}/agents`}
              className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
            >
              Return to agents
            </Link>
            <div className="basis-full text-xs text-muted-foreground">
              Receipt signal: {proofLoop.receiptLabel}. {proofLoop.nextActionDescription}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Selected Work Item</CardTitle>
            <CardDescription>
              Stay inside the project shell while reviewing context, workflow linkage, and operator action history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border text-muted-foreground">
                {work.item.status.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {work.item.signal.label}
              </Badge>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {work.item.priority}
              </Badge>
              {work.item.kind === 'nerve_node' ? (
                <Badge className="bg-blue-500/10 text-blue-500">
                  Workflow step
                </Badge>
              ) : null}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{work.item.title}</h2>
              {work.item.description ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{work.item.description}</p>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Workflow className="h-4 w-4" />
                  Linked run
                </div>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {work.item.pulse_job_run_id ?? 'No linked run'}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Assigned agent
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {work.item.agent_id
                    ? work.agents.find((agent) => agent.id === work.item?.agent_id)?.name ?? work.item.agent_id
                    : 'No agent assignment'}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Clock3 className="h-4 w-4" />
                  Due date
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {work.item.due_at ? new Date(work.item.due_at).toLocaleString() : 'No due date'}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Workflow className="h-4 w-4" />
                  Activity
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {work.events.length} event{work.events.length === 1 ? '' : 's'} recorded on this item.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Readiness
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {work.item.signal.detail}
                </p>
              </div>
            </div>
            {work.item.labels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {work.item.labels.map((label) => (
                  <Badge key={label} variant="outline" className="border-border text-muted-foreground">
                    {label}
                  </Badge>
                ))}
              </div>
            ) : null}
            <Link
              href={buildProjectWorkPath(workspaceSlug, project.slug)}
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to project work
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operator Actions</CardTitle>
            <CardDescription>
              Leave a decision trail, resolve approval-backed work, or complete the task without leaving project context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectWorkDetailActions
              orgId={workspace.id}
              projectId={project.id}
              itemId={work.item.id}
              status={work.item.status}
              hasApprovalBridge={Boolean(linkedApprovalId)}
              hasActiveCheckout={Boolean(work.workGraphContext?.activeCheckout)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Work Graph Context</CardTitle>
            <CardDescription>
              Goal links, PM dependencies, ownership, and evidence pointers for this item.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Target className="h-4 w-4" />
                  Goals
                </div>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {work.workGraphContext?.goals.length ?? 0}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <GitBranch className="h-4 w-4" />
                  Relations
                </div>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {(work.workGraphContext?.incomingRelations.length ?? 0) + (work.workGraphContext?.outgoingRelations.length ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Link2 className="h-4 w-4" />
                  Evidence
                </div>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {work.workGraphContext?.artifactLinks.length ?? 0}
                </p>
              </div>
            </div>

            {work.workGraphContext?.activeCheckout ? (
              <div className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {work.workGraphContext.activeCheckout.purpose}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Active {work.workGraphContext.activeCheckout.owner_kind} checkout
                    </p>
                  </div>
                  <Badge variant="outline" className="border-border text-muted-foreground">
                    {work.workGraphContext.activeCheckout.status}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active Work Graph checkout is holding this item.</p>
            )}

            {work.workGraphContext?.goals.length ? (
              <div className="space-y-2">
                {work.workGraphContext.goals.slice(0, 3).map((goal) => (
                  <div key={goal.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium text-foreground">{goal.title}</p>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {goal.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {work.workGraphContext?.engineFacets.length ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Cpu className="h-4 w-4" />
                  Engine facets
                </div>
                {work.workGraphContext.engineFacets.slice(0, 4).map((facet) => (
                  <div key={facet.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{facet.facet_key.replace(/_/g, ' ')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {facet.engine}{facet.runtime_flavor ? ` · ${facet.runtime_flavor}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        observed
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 break-words font-mono text-xs text-muted-foreground">
                      {JSON.stringify(facet.facet_state)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow Context</CardTitle>
            <CardDescription>
              Understand what this human step unlocks before you resolve it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {work.dagContext ? (
              <div className="space-y-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <GitBranch className="h-4 w-4" />
                    Current node
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {work.dagContext.node.node_key} - {work.dagContext.node.status}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {work.dagContext.downstreamBlockedCount} downstream node
                    {work.dagContext.downstreamBlockedCount === 1 ? '' : 's'} still blocked on this step.
                  </p>
                </div>
                <div className="space-y-2">
                  {work.dagContext.children.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No direct downstream nodes recorded for this task.</p>
                  ) : (
                    work.dagContext.children.map((child) => (
                      <div key={child.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{child.node_key}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {child.node_type} - {child.edge_kind}
                            </p>
                          </div>
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            {child.status}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This work item is not linked to a workflow step, so there is no downstream execution context to display.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blockers & Approval Bridge</CardTitle>
            <CardDescription>
              Why this item is still in the queue, and whether it also controls a linked approval gate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium text-foreground">Current blocker</p>
              <p className="mt-2 text-xs text-muted-foreground">{blockerSummary}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium text-foreground">Approval mirror</p>
              <p className="mt-2 text-xs text-muted-foreground break-all">
                {linkedApprovalId
                  ? `Linked approval ${linkedApprovalId}. Approving or rejecting this work item will also resolve the underlying approval.`
                  : 'No approval mirror is linked to this work item.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Continuation Handoff</CardTitle>
            <CardDescription>
              Preserve the next useful operator step instead of forcing a re-read of the full run narrative.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContinuationHandoffCard
              handoff={continuation}
              emptyText="No explicit continuation handoff is needed from the linked run right now."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Queue Snapshot</CardTitle>
            <CardDescription>
              Keep nearby work visible so operators can handle related tasks without leaving project context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {work.items.slice(0, 6).map((item) => (
                <Link
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
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Timeline</CardTitle>
          <CardDescription>
            A project-scoped activity thread for this work item.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {work.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No work-item events have been recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {work.events.map((event) => (
                <div key={event.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatEventLabel(event.event_type)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actor_kind === 'external_sync'
                          ? `External sync${event.actor_external_provider ? ` - ${event.actor_external_provider}` : ''}`
                          : event.actor_kind === 'agent'
                            ? `Agent${event.actor_agent_id ? ` - ${event.actor_agent_id}` : ''}`
                            : event.actor_kind === 'user'
                              ? `User${event.actor_user_id ? ` - ${event.actor_user_id}` : ''}`
                              : 'System'}
                      </p>
                      <p className="mt-2 text-xs text-foreground/80">
                        {describeWorkItemEvent(event)}
                      </p>
                      {Object.keys(event.payload ?? {}).length > 0 ? (
                        <pre className="mt-2 overflow-x-auto rounded bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked Run Narrative</CardTitle>
          <CardDescription>
            Use the shared run narrative language to inspect the execution that produced or blocked this work item.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkRunLegibilityPanel events={work.linkedRunEvents} />
        </CardContent>
      </Card>

      <PlatformGuaranteesCard context="create-agent" compact />

      <Card>
        <CardHeader>
          <CardTitle>Artifacts & Outputs</CardTitle>
          <CardDescription>
            The strongest visible outputs captured from the linked run for this work item.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkedRunArtifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No linked artifacts were extracted from the recorded run events yet.
            </p>
          ) : (
            <div className="space-y-3">
              {linkedRunArtifacts.map((artifact) => (
                <div key={artifact.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{artifact.title}</p>
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      {artifact.kind.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {artifact.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project Work Queue</CardTitle>
          <CardDescription>
            This detail stays inside the project shell instead of bouncing through Operations.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[calc(100vh-18rem)] min-h-[640px]">
            <WorkItemsClient
              orgId={workspace.id}
              currentUserId={userId}
              agentIds={work.agentIds}
              initialSelectedId={itemId}
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
