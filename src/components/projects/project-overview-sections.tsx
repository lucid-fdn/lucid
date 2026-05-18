import type { CrewRun } from '@contracts/crew'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  Inbox,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import React from 'react'

import { PlatformGuaranteesCard } from '@/components/platform/platform-guarantees-card'
import {
  ProjectDomainTimeline,
  type ProjectDomainTimelineItem,
} from '@/components/projects/project-domain-timeline'
import { LiveRunWidget } from '@/components/runs/live-run-widget'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { WorkspaceMetricCard } from '@/components/workspace/workspace-metric-card'

interface ProjectMetricGridProps {
  agents: number
  activeAgents: number
  teams: number
  approvals: number
  templates: number
  reliabilityLabel: string
  reliabilityDetail: string
  reliabilityTrend: string
}

interface ProofLoop {
  stage:
    | 'create-agent'
    | 'create-work'
    | 'review-inbox'
    | 'review-runs'
    | 'harden-runtime'
  title: string
  summary: string
  receiptLabel: string
  nextActionTitle: string
  nextActionDescription: string
}

interface ProjectFirstProofSectionProps {
  proofLoop: ProofLoop
  agentBuilderHref: string
  workHref: string
  inboxHref: string
  runsHref: string
}

interface AgentOpsLink {
  title: string
  description: string
  href: string
}

interface KnowledgePageItem {
  id: string
  subject: string
  version: number
  compiledTruth: string
  evidence: unknown[]
  trustLevel: string
}

interface KnowledgeEntityItem {
  id: string
  canonicalName: string
}

interface KnowledgeFindingItem {
  id: string
  title: string
  severity: string
}

interface ProjectKnowledgeSectionProps {
  pages: KnowledgePageItem[]
  entities: KnowledgeEntityItem[]
  findings: KnowledgeFindingItem[]
}

interface RuntimePresentation {
  title: string
  description: string
}

interface RuntimePackaging {
  primaryTitle: string | null
  operatorLabel: string | null
  alignmentLabel: string
  guidance: string
}

interface ProjectRuntimePathsSectionProps {
  sharedRuntime: RuntimePresentation
  managedRuntime: RuntimePresentation
  byoRuntime: RuntimePresentation
  runtimeCounts: {
    shared: number
    managed: number
    byo: number
  }
  runtimePackaging: RuntimePackaging
}

interface QuickAction {
  title: string
  description: string
  href: string
  icon: LucideIcon
}

interface ProjectAttentionSectionProps {
  approvals: number
  failedRuns: number
  openWorkItems: number
  assistantsCount: number
  crewsCount: number
}

interface ProjectFeedEvent {
  id: string
  agent_name: string
  event_type: string
  created_at: string
}

interface ProjectRecentActivitySectionProps {
  events: ProjectFeedEvent[]
  formatEventLabel: (eventType: string) => string
}

interface ProjectLiveRunSectionProps {
  liveCrewRun:
    | (ComponentProps<typeof LiveRunWidget>['run'] & { crewName: string })
    | null
  runsHref: string
}

interface AssistantItem {
  id: string
  name: string
  lucid_model: string
}

interface AgentProjection {
  runtimeTitle?: string | null
  teamLabel?: string | null
  channelCount?: number | null
  attentionLabel?: string | null
  lastEventLabel?: string | null
  needsAttention?: boolean
  pendingApprovals?: number | null
}

interface ProjectFleetSnapshotSectionProps {
  assistants: AssistantItem[]
  agentProjectionById: Map<string, AgentProjection>
}

interface ProjectTeamActivitySectionProps {
  activeCrewRuns: Array<CrewRun & { crewName: string }>
  recentCrewRuns: Array<CrewRun & { crewName: string }>
  formatRunStatus: (status: string) => string
}

function PrimaryLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      {children}
    </Link>
  )
}

function BorderedLinkCard({
  href,
  title,
  description,
  icon: Icon,
}: QuickAction) {
  return (
    <Link
      href={href}
      className="rounded-lg border p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </Link>
  )
}

export function ProjectMetricGrid({
  agents,
  activeAgents,
  teams,
  approvals,
  templates,
  reliabilityLabel,
  reliabilityDetail,
  reliabilityTrend,
}: ProjectMetricGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <WorkspaceMetricCard
        label="Agents"
        value={agents}
        detail={`${activeAgents} active and ready to run`}
      />
      <WorkspaceMetricCard
        label="Teams"
        value={teams}
        detail="Multi-agent groups inside this project"
      />
      <WorkspaceMetricCard
        label="Approvals"
        value={approvals}
        detail="Pending intervention points across active runs"
        tone={approvals > 0 ? 'warning' : 'default'}
      />
      <WorkspaceMetricCard
        label="Templates"
        value={templates}
        detail="Reusable starting points owned by this project"
      />
      <WorkspaceMetricCard
        label="Reliability"
        value={reliabilityLabel}
        detail={reliabilityDetail}
      >
        <div className="mt-2 text-xs text-muted-foreground">
          {reliabilityTrend}
        </div>
      </WorkspaceMetricCard>
    </div>
  )
}

export function ProjectFirstProofSection({
  proofLoop,
  agentBuilderHref,
  workHref,
  inboxHref,
  runsHref,
}: ProjectFirstProofSectionProps) {
  const actionHref =
    proofLoop.stage === 'create-agent'
      ? agentBuilderHref
      : proofLoop.stage === 'create-work'
        ? `${workHref}?composer=open`
        : proofLoop.stage === 'review-inbox'
          ? inboxHref
          : runsHref

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle>First Proof</CardTitle>
        </div>
        <CardDescription>
          Follow the shortest path from an empty project to a real receipt
          inside Lucid.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {[
            {
              title: '1. Create your first agent',
              description:
                'Agents are the default building block. Start with one before you reach for teams.',
            },
            {
              title: '2. Create one work item',
              description:
                'Turn intent into a project task so operators can review and route it cleanly.',
            },
            {
              title: '3. Review the proof surface',
              description:
                'Use Runs and Inbox as receipts: what happened, what failed, and what needs attention next.',
            },
          ].map((step) => (
            <div
              key={step.title}
              className="rounded-lg border bg-background/60 p-3"
            >
              <p className="text-sm font-medium text-foreground">
                {step.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-lg border bg-background/70 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {proofLoop.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {proofLoop.summary}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Receipt signal: {proofLoop.receiptLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <PrimaryLink href={actionHref}>
              {proofLoop.nextActionTitle}
            </PrimaryLink>
            <div className="basis-full text-xs text-muted-foreground">
              {proofLoop.nextActionDescription}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectAgentOpsSection({ links }: { links: AgentOpsLink[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <CardTitle>Agent Ops</CardTitle>
        </div>
        <CardDescription>
          Launch evidence-backed workflows from this project context without
          retyping scope.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.title}
            href={link.href}
            className="rounded-lg border p-3 transition-colors hover:border-primary/40"
          >
            <p className="text-sm font-medium text-foreground">{link.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {link.description}
            </p>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

export function ProjectKnowledgeSection({
  pages,
  entities,
  findings,
}: ProjectKnowledgeSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <CardTitle>Project Knowledge</CardTitle>
        </div>
        <CardDescription>
          Compiled project brain: current facts, decisions, and evidence that
          agents can reuse across workflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pages.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium text-foreground">
              No compiled project knowledge yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Run Agent Ops or seed project knowledge to turn learnings,
              evidence, and timeline events into reusable context.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {pages.map((page) => (
              <div key={page.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {page.subject}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    v{page.version}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                  {page.compiledTruth}
                </p>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {page.evidence.length} evidence link
                  {page.evidence.length === 1 ? '' : 's'} -{' '}
                  {page.trustLevel.replace(/_/g, ' ')}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Knowledge graph
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {entities.length} active entit
              {entities.length === 1 ? 'y' : 'ies'} extracted for graph-aware
              project recall.
            </p>
            {entities.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {entities.slice(0, 5).map((entity) => (
                  <Badge
                    key={entity.id}
                    variant="outline"
                    className="text-[10px]"
                  >
                    {entity.canonicalName}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Brain Ops</p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {findings.length === 0
                ? 'No open project knowledge maintenance findings.'
                : `${findings.length} open maintenance finding${findings.length === 1 ? '' : 's'} need review.`}
            </p>
            {findings.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="line-clamp-1 text-muted-foreground">
                      {finding.title}
                    </span>
                    <Badge
                      variant={
                        finding.severity === 'critical'
                          ? 'destructive'
                          : 'outline'
                      }
                      className="text-[10px]"
                    >
                      {finding.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectRuntimePathsSection({
  sharedRuntime,
  managedRuntime,
  byoRuntime,
  runtimeCounts,
  runtimePackaging,
}: ProjectRuntimePathsSectionProps) {
  const options = [
    { runtime: sharedRuntime, count: runtimeCounts.shared },
    { runtime: managedRuntime, count: runtimeCounts.managed },
    { runtime: byoRuntime, count: runtimeCounts.byo },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime Paths</CardTitle>
        <CardDescription>
          Package runtime choices in operator terms before you scale this
          project into heavier traffic or multi-agent teams.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        {options.map(({ runtime, count }) => (
          <div key={runtime.title} className="rounded-lg border p-4">
            <p className="text-sm font-medium text-foreground">
              {runtime.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {runtime.description}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {count} agent{count === 1 ? '' : 's'} in this project
            </p>
          </div>
        ))}
        <div className="rounded-lg border p-4 lg:col-span-3">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Project runtime posture
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-foreground">
              {runtimePackaging.primaryTitle ?? 'No runtime-ready agents yet'}
            </p>
            {runtimePackaging.operatorLabel ? (
              <Badge
                variant="outline"
                className="border-border text-muted-foreground"
              >
                {runtimePackaging.operatorLabel}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {runtimePackaging.alignmentLabel}. {runtimePackaging.guidance}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectQuickActionsSection({
  actions,
}: {
  actions: QuickAction[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>
          Start with a single agent, then scale into teams and runs when the
          project needs more coordination.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <BorderedLinkCard key={action.title} {...action} />
        ))}
      </CardContent>
    </Card>
  )
}

export function ProjectAttentionSection({
  approvals,
  failedRuns,
  openWorkItems,
  assistantsCount,
  crewsCount,
}: ProjectAttentionSectionProps) {
  const recommendation =
    failedRuns > 0 || openWorkItems > 0
      ? 'Open Inbox to resolve failures, approvals, and human work before starting something new.'
      : assistantsCount === 0
        ? 'Create the first agent so the project has something to run.'
        : crewsCount === 0
          ? 'Keep using standalone agents, or create a team once coordination starts to matter.'
          : 'Inspect runs and approvals to validate the team setup and execution loop.'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attention Needed</CardTitle>
        <CardDescription>
          The shortest path to unblocking work in this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldAlert className="h-4 w-4" />
            Pending approvals
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {approvals > 0
              ? `${approvals} approval${approvals === 1 ? '' : 's'} waiting for a decision.`
              : 'No approvals are blocking this project right now.'}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4" />
            Next recommended move
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{recommendation}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectRecentActivitySection({
  events,
  formatEventLabel,
}: ProjectRecentActivitySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>
          Recent agent and run events scoped to the agents currently in this
          project.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent activity yet. Start by creating an agent or running an
            existing team.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {event.agent_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatEventLabel(event.event_type)}
                  </p>
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ProjectDomainProgressSection({
  items,
}: {
  items: ProjectDomainTimelineItem[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain Progress</CardTitle>
        <CardDescription>
          Read what the project has delivered, escalated, or blocked in business
          terms before diving into raw receipts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ProjectDomainTimeline items={items} />
      </CardContent>
    </Card>
  )
}

export function ProjectHandledByLucidSection() {
  return <PlatformGuaranteesCard context="proof-loop" />
}

export function ProjectLiveRunSection({
  liveCrewRun,
  runsHref,
}: ProjectLiveRunSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Run</CardTitle>
        <CardDescription>
          Keep the most important active team execution visible from the project
          shell.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {liveCrewRun ? (
          <LiveRunWidget
            run={liveCrewRun}
            title={`${liveCrewRun.crewName} is running`}
            ownerLabel="Active team execution in this project"
            href={runsHref}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No team run is active right now. Start a run from Teams or Runs to
            surface live execution here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function ProjectFleetSnapshotSection({
  assistants,
  agentProjectionById,
}: ProjectFleetSnapshotSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Snapshot</CardTitle>
        <CardDescription>
          Runtime mode, latest signal, and operator attention for the agents in
          this project.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {assistants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agents yet. Create the first one to start building a fleet.
          </p>
        ) : (
          <div className="space-y-3">
            {assistants.slice(0, 6).map((assistant) => {
              const projection = agentProjectionById.get(assistant.id)
              return (
                <div key={assistant.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {assistant.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {projection?.runtimeTitle ?? 'Shared runtime'} -{' '}
                        {assistant.lucid_model}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {projection?.teamLabel ?? 'Standalone'} -{' '}
                        {projection?.channelCount ?? 0} channel
                        {projection?.channelCount === 1 ? '' : 's'}
                      </p>
                      {projection?.attentionLabel ? (
                        <p className="mt-2 text-xs text-amber-400">
                          Attention: {projection.attentionLabel}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {projection?.lastEventLabel
                          ? `Latest: ${projection.lastEventLabel}`
                          : 'No recent events yet'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {projection?.needsAttention ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 text-amber-400"
                        >
                          Attention
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-border text-muted-foreground"
                        >
                          Stable
                        </Badge>
                      )}
                      {projection?.pendingApprovals ? (
                        <span className="text-[11px] text-muted-foreground">
                          {projection.pendingApprovals} approval
                          {projection.pendingApprovals === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ProjectTeamActivitySection({
  activeCrewRuns,
  recentCrewRuns,
  formatRunStatus,
}: ProjectTeamActivitySectionProps) {
  return (
    <React.Fragment>
      <Card>
        <CardHeader>
          <CardTitle>Live Team Activity</CardTitle>
          <CardDescription>
            The team runs currently starting or executing inside this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeCrewRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No team runs are active right now.
            </p>
          ) : (
            <div className="space-y-3">
              {activeCrewRuns.slice(0, 6).map((run) => (
                <div key={run.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {run.crewName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Started {new Date(run.started_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-border text-muted-foreground"
                    >
                      {formatRunStatus(run.status)}
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
          <CardTitle>Recent Receipts</CardTitle>
          <CardDescription>
            The latest team run outcomes you can inspect or validate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentCrewRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No team receipts yet. Start a run to produce proof here.
            </p>
          ) : (
            <div className="space-y-3">
              {recentCrewRuns.slice(0, 6).map((run) => (
                <div key={run.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {run.crewName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRunStatus(run.status)} at{' '}
                        {new Date(run.created_at).toLocaleString()}
                      </p>
                      {run.outcome_summary ? (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {run.outcome_summary}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant="outline"
                      className="border-border text-muted-foreground"
                    >
                      ${run.total_cost_usd.toFixed(2)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </React.Fragment>
  )
}

export function buildProjectQuickActions({
  inboxHref,
  agentsHref,
  workHref,
  teamsHref,
  runsHref,
}: {
  inboxHref: string
  agentsHref: string
  workHref: string
  teamsHref: string
  runsHref: string
}): QuickAction[] {
  return [
    {
      href: inboxHref,
      title: 'Open Inbox',
      icon: Inbox,
      description:
        'Review approvals, failures, human tasks, and critical project attention.',
    },
    {
      href: agentsHref,
      title: 'Open Agents',
      icon: Bot,
      description: 'Operate and manage agents in canvas, grid, or list view.',
    },
    {
      href: workHref,
      title: 'Open Work',
      icon: Inbox,
      description:
        'Review the project-scoped queue of tickets, approvals, and workflow handoffs.',
    },
    {
      href: teamsHref,
      title: 'Create or Edit Teams',
      icon: Users,
      description:
        'Group agents when you need coordinator-led multi-agent execution.',
    },
    {
      href: runsHref,
      title: 'Inspect Runs',
      icon: Activity,
      description:
        'Review recent execution, failures, approvals, and next actions.',
    },
  ]
}
