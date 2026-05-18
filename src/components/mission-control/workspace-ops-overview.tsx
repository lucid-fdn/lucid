'use client'

import {
  AlertTriangle,
  BriefcaseBusiness,
  DollarSign,
  FolderKanban,
  Radar,
  ServerCog,
} from 'lucide-react'

import { KPICard } from '@/components/mission-control/kpi-card'
import { EmptyState, PageSection } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'
import type { MissionControlOverviewData } from '@/lib/db/mission-control'
import {
  buildProjectWorkDetailPath,
  buildWorkspaceProjectInboxUrl,
  buildWorkspaceProjectOverviewUrl,
} from '@/lib/projects/urls'

interface WorkspaceOpsOverviewProps {
  data: MissionControlOverviewData
  workspaceSlug: string
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`
}

function joinNonZeroCounts(
  items: Array<{ value: number; singular: string; plural?: string }>,
  fallback: string,
) {
  const parts = items
    .filter((item) => item.value > 0)
    .map((item) => formatCount(item.value, item.singular, item.plural))

  return parts.length > 0 ? parts.join(' - ') : fallback
}

export function WorkspaceOpsOverview({
  data,
  workspaceSlug,
}: WorkspaceOpsOverviewProps) {
  const inactiveAgents = Math.max(data.summary.agents - data.summary.activeAgents, 0)
  const fleetDetail = inactiveAgents > 0
    ? `${formatCount(data.summary.projects, 'project')} - ${inactiveAgents} offline`
    : `${formatCount(data.summary.projects, 'project')} - all active agents are online`
  const attentionValue = data.attentionCount > 0 ? data.attentionCount : 'Clear'
  const attentionDetail = joinNonZeroCounts(
    [
      { value: data.summary.approvals, singular: 'approval' },
      { value: data.summary.readyWorkItems, singular: 'ready item' },
      { value: data.summary.nativeMutationBacklog, singular: 'change review' },
    ],
    'Nothing needs review',
  )
  const runtimeValue = data.summary.runtimeIncidents > 0 ? data.summary.runtimeIncidents : 'Healthy'
  const runtimeDetail = data.summary.runtimeIncidents > 0
    ? `${formatCount(data.runtimes.offline, 'offline runtime')} - ${formatUsd(data.summary.costTodayUsd)} today`
    : `Systems online - ${formatUsd(data.summary.costTodayUsd)} today`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-6 py-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <KPICard
            label="Attention"
            value={attentionValue}
            icon={Radar}
            trendValue={attentionDetail}
            variant={data.attentionCount > 0 ? 'warning' : 'default'}
          />
          <KPICard
            label="Agents"
            value={`${data.summary.activeAgents}/${data.summary.agents}`}
            icon={FolderKanban}
            trendValue={fleetDetail}
            variant={data.summary.unhealthyAgents > 0 ? 'warning' : 'default'}
          />
          <KPICard
            label="Runtime & Spend"
            value={runtimeValue}
            icon={ServerCog}
            trendValue={runtimeDetail}
            variant={data.summary.runtimeIncidents > 0 ? 'error' : 'default'}
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <PageSection
            title="Projects Needing Attention"
            description="The workspace areas most likely to need a decision."
          >
            <div className="space-y-3">
              {data.hotProjects.length === 0 ? (
                <EmptyState
                  title="No projects need attention"
                  description="Projects will appear here when work stalls, approvals wait, or reliability drops."
                />
              ) : (
                data.hotProjects.map((project) => (
                  <WorkspaceActionRow
                    key={project.projectId}
                    href={
                      buildWorkspaceProjectOverviewUrl(
                        project.projectSlug,
                        workspaceSlug,
                      ) ?? '#'
                    }
                    title={project.projectName}
                    description={project.priorityReason}
                    icon={FolderKanban}
                    tone={project.attentionCount > 0 ? 'warning' : 'default'}
                    meta={
                      <>
                        <div className="font-medium text-foreground">
                          {project.attentionCount} attention
                        </div>
                        <div>{project.summary.activeRuns} active runs</div>
                      </>
                    }
                  />
                ))
              )}
            </div>
          </PageSection>

          <PageSection
            title="Waiting On You"
            description="Approvals and decisions blocking forward progress."
          >
            <div className="space-y-3">
              {data.pendingApprovals.length === 0 ? (
                <EmptyState
                  title="Nothing is waiting on approval"
                  description="Agent requests that need a human decision will appear here."
                />
              ) : (
                data.pendingApprovals.map((approval) => (
                  <WorkspaceActionRow
                    key={approval.id}
                    href={
                      buildWorkspaceProjectInboxUrl(
                        approval.projectSlug,
                        workspaceSlug,
                      ) ?? '#'
                    }
                    title={approval.projectName}
                    description={`${approval.agent_name} is waiting on ${approval.tool_name}.`}
                    icon={Radar}
                    tone={approval.risk_level === 'high' ? 'danger' : 'warning'}
                    meta={
                      <>
                        <div className="font-medium text-foreground capitalize">
                          {approval.risk_level}
                        </div>
                        <div>
                          {new Date(approval.requested_at).toLocaleDateString()}
                        </div>
                      </>
                    }
                  />
                ))
              )}
            </div>
          </PageSection>
        </div>

        <div className="space-y-6">
          <PageSection
            title="Ready To Pick Up"
            description="Work that can move now."
          >
            <div className="space-y-3">
              {data.readyWorkItems.length === 0 ? (
                <EmptyState
                  title="No work is waiting"
                  description="Ready work appears here when a project has a clear next action."
                />
              ) : (
                data.readyWorkItems.map((item) => (
                  <WorkspaceActionRow
                    key={item.id}
                    href={buildProjectWorkDetailPath(
                      workspaceSlug,
                      item.projectSlug,
                      item.id,
                    )}
                    title={item.title}
                    description={item.projectName}
                    icon={BriefcaseBusiness}
                    tone="default"
                    meta={
                      <>
                        <div className="font-medium text-foreground capitalize">
                          {item.status}
                        </div>
                        <div className="capitalize">
                          {item.kind.replace(/_/g, ' ')}
                        </div>
                      </>
                    }
                  />
                ))
              )}
            </div>
          </PageSection>

          <PageSection
            title="Reliability"
            description="Failures, stalled execution, and degraded runtime signals."
          >
            <div className="space-y-3">
              {data.failures.length === 0 ? (
                <EmptyState
                  title="No reliability issues"
                  description="Failures and degraded execution will surface here when they need review."
                />
              ) : (
                data.failures.map((failure) => (
                  <WorkspaceActionRow
                    key={failure.key}
                    href={
                      buildWorkspaceProjectOverviewUrl(
                        failure.projectSlug,
                        workspaceSlug,
                      ) ?? '#'
                    }
                    title={failure.title}
                    description={failure.detail}
                    icon={AlertTriangle}
                    tone="danger"
                    meta={
                      <>
                        <div className="font-medium text-foreground capitalize">
                          {failure.kind.replace(/_/g, ' ')}
                        </div>
                        <div>{failure.projectName}</div>
                      </>
                    }
                  />
                ))
              )}
            </div>
          </PageSection>
        </div>
      </div>
    </div>
  )
}
