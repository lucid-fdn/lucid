import { notFound } from 'next/navigation'
import React from 'react'

import { PageHeader } from '@/components/page/page-header'
import { PageShell } from '@/components/page/page-shell'
import { type ProjectDomainTimelineItem } from '@/components/projects/project-domain-timeline'
import {
  ProjectAgentOpsSection,
  ProjectAttentionSection,
  ProjectDomainProgressSection,
  ProjectFirstProofSection,
  ProjectFleetSnapshotSection,
  ProjectHandledByLucidSection,
  ProjectKnowledgeSection,
  ProjectLiveRunSection,
  ProjectMetricGrid,
  ProjectQuickActionsSection,
  ProjectRecentActivitySection,
  ProjectRuntimePathsSection,
  ProjectTeamActivitySection,
  buildProjectQuickActions,
} from '@/components/projects/project-overview-sections'
import { ProjectSurfaceTelemetryBeacon } from '@/components/projects/project-surface-telemetry-beacon'
import { Badge } from '@/components/ui/badge'
import { buildAgentOpsLaunchHref } from '@/lib/agent-ops/context-launch'
import { requireUserId } from '@/lib/auth/server-utils'
import {
  findKnowledgeEntities,
  listKnowledgeMaintenanceEvents,
  listKnowledgePages,
} from '@/lib/db'
import { getRuntimeModePresentation } from '@/lib/engines/presentation'
import { getProjectOverviewProjection } from '@/lib/projects/read-model'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import {
  buildProjectAgentBuilderPath,
  buildProjectAgentsPath,
  buildProjectInboxPath,
  buildProjectRunsPath,
  buildProjectTeamsPath,
  buildProjectWorkPath,
} from '@/lib/projects/urls'

function formatEventLabel(eventType: string) {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatRunStatus(status: string) {
  return status.replace(/_/g, ' ')
}

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug } =
    await params

  const scope = await resolveWorkspaceProjectScope(
    workspaceSlug,
    userId,
    projectSlug,
  )
  if (!scope) notFound()

  const { workspace, project } = scope
  const agentsHref = buildProjectAgentsPath(workspaceSlug, project.slug)
  const agentBuilderHref = buildProjectAgentBuilderPath(
    workspaceSlug,
    project.slug,
  )
  const inboxHref = buildProjectInboxPath(workspaceSlug, project.slug)
  const workHref = buildProjectWorkPath(workspaceSlug, project.slug)
  const teamsHref = buildProjectTeamsPath(workspaceSlug, project.slug)
  const runsHref = buildProjectRunsPath(workspaceSlug, project.slug)

  const projectReviewHref = buildAgentOpsLaunchHref({
    workspaceSlug,
    workflowId: 'review',
    source: 'project',
    projectId: project.id,
    scopeType: 'project',
    scopeRef: project.slug,
    scopeLabel: project.name,
    inputDefaults: {
      target: project.name,
      focus: 'Correctness, tests, security, and project-specific regressions',
    },
  })
  const projectInvestigateHref = buildAgentOpsLaunchHref({
    workspaceSlug,
    workflowId: 'investigate',
    source: 'project',
    projectId: project.id,
    scopeType: 'project',
    scopeRef: project.slug,
    scopeLabel: project.name,
    inputDefaults: {
      target: `${project.name} current risks, logs, and open operator signals`,
    },
  })
  const projectQaHref = buildAgentOpsLaunchHref({
    workspaceSlug,
    workflowId: 'qa',
    source: 'project',
    projectId: project.id,
    scopeType: 'project',
    scopeRef: project.slug,
    scopeLabel: project.name,
    inputDefaults: {
      target: project.name,
      scenario: 'Smoke the critical user path for this project',
    },
  })
  const projectRetroHref = buildAgentOpsLaunchHref({
    workspaceSlug,
    workflowId: 'retro',
    source: 'project',
    projectId: project.id,
    scopeType: 'project',
    scopeRef: project.slug,
    scopeLabel: project.name,
    inputDefaults: {
      target: `${project.name} recent runs and project learnings`,
    },
  })
  const projectShipHref = buildAgentOpsLaunchHref({
    workspaceSlug,
    workflowId: 'ship',
    source: 'project',
    projectId: project.id,
    scopeType: 'project',
    scopeRef: project.slug,
    scopeLabel: project.name,
    inputDefaults: {
      target: project.name,
    },
  })
  const projectCanaryHref = buildAgentOpsLaunchHref({
    workspaceSlug,
    workflowId: 'canary',
    source: 'project',
    projectId: project.id,
    scopeType: 'project',
    scopeRef: project.slug,
    scopeLabel: project.name,
  })

  const [
    overview,
    projectKnowledgePages,
    projectKnowledgeEntities,
    projectKnowledgeFindings,
  ] = await Promise.all([
    getProjectOverviewProjection(workspace.id, project.id),
    listKnowledgePages({
      orgId: workspace.id,
      projectId: project.id,
      scopeType: 'project',
      limit: 3,
    }),
    findKnowledgeEntities({
      orgId: workspace.id,
      projectId: project.id,
      limit: 5,
    }),
    listKnowledgeMaintenanceEvents({
      orgId: workspace.id,
      projectId: project.id,
      status: 'open',
      limit: 3,
    }),
  ])

  const {
    counts,
    attention,
    activeAgents,
    metrics,
    runtimeCounts,
    runtimePackaging,
    proofLoop,
    agentProjectionById,
  } = overview
  const liveCrewRun = attention.activeCrewRuns[0] ?? null
  const assistants = attention.assistants
  const projectFeedEvents = (attention.projectFeedEvents ?? []).slice(0, 6)
  const sharedRuntime = getRuntimeModePresentation({ runtimeFlavor: 'shared' })
  const managedRuntime = getRuntimeModePresentation({
    runtimeFlavor: 'c1_managed',
    runtimeTier: 'dedicated',
  })
  const byoRuntime = getRuntimeModePresentation({
    runtimeFlavor: 'c2a_autonomous',
    runtimeTier: 'byo',
  })

  const reliabilityLabel =
    metrics.crewFailureRate == null ? 'n/a' : `${metrics.crewFailureRate}%`
  const reliabilityDetail =
    metrics.crewRecoveryRate == null
      ? `${metrics.operatorLoad} open operator signal${metrics.operatorLoad === 1 ? '' : 's'}`
      : `Recovery ${metrics.crewRecoveryRate}% - ${metrics.operatorLoad} open signal${metrics.operatorLoad === 1 ? '' : 's'}`
  const reliabilityTrend =
    metrics.crewTrendDirection === 'insufficient_data'
      ? 'Not enough resolved team runs yet'
      : metrics.crewTrendDirection === 'improving'
        ? `Trend improving${metrics.recoveryStreak > 0 ? ` - ${metrics.recoveryStreak} successful run${metrics.recoveryStreak === 1 ? '' : 's'} in a row` : ''}`
        : metrics.crewTrendDirection === 'worsening'
          ? 'Trend worsening'
          : 'Trend steady'

  const agentOpsLinks = [
    {
      title: 'Investigate',
      href: projectInvestigateHref,
      description:
        'Triage current risks, logs, and operator signals with evidence.',
    },
    {
      title: 'Review',
      href: projectReviewHref,
      description:
        'Open Review with project scope and regression focus prefilled.',
    },
    {
      title: 'QA',
      href: projectQaHref,
      description: 'Start browser-backed QA from the project surface.',
    },
    {
      title: 'Ship',
      href: projectShipHref,
      description: 'Check gates, risk, approval state, and rollback guidance.',
    },
    {
      title: 'Canary',
      href: projectCanaryHref,
      description: 'Watch a deploy or release candidate for regressions.',
    },
    {
      title: 'Retro',
      href: projectRetroHref,
      description: 'Capture learnings after releases, incidents, or runs.',
    },
  ]

  const quickActions = buildProjectQuickActions({
    inboxHref,
    agentsHref,
    workHref,
    teamsHref,
    runsHref,
  })
  const domainTimelineItems: ProjectDomainTimelineItem[] = [
    ...attention.readyWorkItems.slice(0, 2).map((item) => ({
      id: `ready-${item.id}`,
      status: 'reviewed' as const,
      title: item.title,
      detail:
        item.signal.detail ||
        'This work is ready for an operator or next execution step.',
    })),
    ...attention.blockedWorkItems.slice(0, 2).map((item) => ({
      id: `blocked-${item.id}`,
      status: 'blocked' as const,
      title: item.title,
      detail:
        item.signal.detail ||
        'This work is waiting on a missing dependency or approval.',
    })),
    ...attention.pendingApprovals.slice(0, 2).map((approval) => ({
      id: `approval-${approval.id}`,
      status: 'escalated' as const,
      title: approval.tool_name
        ? `Approval needed for ${approval.tool_name}`
        : 'Approval needed',
      detail:
        approval.risk_level === 'critical'
          ? 'A critical-risk action is waiting on an operator decision before this work can continue.'
          : approval.risk_level === 'high'
            ? 'A high-risk action is waiting on an operator decision before this work can continue.'
            : 'An operator decision is currently blocking the next step.',
    })),
    ...attention.activeCrewRuns.slice(0, 2).map((run) => ({
      id: `run-${run.id}`,
      status: 'completed' as const,
      title: `${run.crewName} is active`,
      detail:
        run.outcome_summary ||
        'A team run is currently executing inside this project.',
    })),
  ].slice(0, 6)

  return (
    <React.Fragment>
      <PageShell contentClassName="gap-6 px-6 py-6">
        <ProjectSurfaceTelemetryBeacon
          event="project:overview:view"
          payload={{
            workspaceId: workspace.id,
            projectId: project.id,
            projectSlug: project.slug,
          }}
        />
        <PageHeader
          className="rounded-2xl border border-b border-border/70 bg-card/40 px-5 py-4"
          title={project.name}
          description="Launch agents, scale into teams, and inspect the runs that prove what this project has done."
          eyebrow={
            <Badge
              variant="outline"
              className="border-border text-muted-foreground"
            >
              Project
            </Badge>
          }
        />

        <ProjectMetricGrid
          agents={counts.assistants}
          activeAgents={activeAgents}
          teams={counts.crews}
          approvals={attention.summary.approvals}
          templates={counts.templates}
          reliabilityLabel={reliabilityLabel}
          reliabilityDetail={reliabilityDetail}
          reliabilityTrend={reliabilityTrend}
        />

        <ProjectFirstProofSection
          proofLoop={proofLoop}
          agentBuilderHref={agentBuilderHref}
          workHref={workHref}
          inboxHref={inboxHref}
          runsHref={runsHref}
        />

        <ProjectAgentOpsSection links={agentOpsLinks} />
        <ProjectKnowledgeSection
          pages={projectKnowledgePages}
          entities={projectKnowledgeEntities}
          findings={projectKnowledgeFindings}
        />
        <ProjectRuntimePathsSection
          sharedRuntime={sharedRuntime}
          managedRuntime={managedRuntime}
          byoRuntime={byoRuntime}
          runtimeCounts={runtimeCounts}
          runtimePackaging={runtimePackaging}
        />

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <ProjectQuickActionsSection actions={quickActions} />
          <ProjectAttentionSection
            approvals={attention.summary.approvals}
            failedRuns={attention.summary.failedRuns}
            openWorkItems={attention.summary.openWorkItems}
            assistantsCount={counts.assistants}
            crewsCount={counts.crews}
          />
        </div>

        <ProjectRecentActivitySection
          events={projectFeedEvents}
          formatEventLabel={formatEventLabel}
        />
        <ProjectDomainProgressSection items={domainTimelineItems} />
        <ProjectHandledByLucidSection />
        <ProjectLiveRunSection liveCrewRun={liveCrewRun} runsHref={runsHref} />

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <ProjectFleetSnapshotSection
            assistants={assistants}
            agentProjectionById={agentProjectionById}
          />
          <ProjectTeamActivitySection
            activeCrewRuns={attention.activeCrewRuns}
            recentCrewRuns={attention.recentCrewRuns}
            formatRunStatus={formatRunStatus}
          />
        </div>
      </PageShell>
    </React.Fragment>
  )
}
