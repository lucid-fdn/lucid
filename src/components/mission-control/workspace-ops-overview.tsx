'use client'

import {
  AlertTriangle,
  BriefcaseBusiness,
  DollarSign,
  FolderKanban,
  PlayCircle,
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

export function WorkspaceOpsOverview({
  data,
  workspaceSlug,
}: WorkspaceOpsOverviewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-6 py-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KPICard
            label="Attention"
            value={data.attentionCount}
            icon={Radar}
            trend="flat"
            trendValue={`${data.summary.approvals} approvals`}
            variant={data.attentionCount > 0 ? 'warning' : 'default'}
          />
          <KPICard
            label="Runtime Incidents"
            value={data.summary.runtimeIncidents}
            icon={ServerCog}
            trend="flat"
            trendValue={`${data.runtimes.offline} offline`}
            variant={data.summary.runtimeIncidents > 0 ? 'error' : 'default'}
          />
          <KPICard
            label="Active Runs"
            value={data.summary.activeRuns}
            icon={PlayCircle}
          />
          <KPICard
            label="Spend Today"
            value={formatUsd(data.summary.costTodayUsd)}
            icon={DollarSign}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{data.summary.projects} projects</span>
          <span>{data.summary.activeAgents}/{data.summary.agents} agents active</span>
          <span>{data.summary.readyWorkItems} ready work</span>
          <span>{data.summary.nativeMutationBacklog} proposed changes</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <PageSection
            title="Hot Projects"
            description="Projects most likely to need review."
          >
            <div className="space-y-3">
              {data.hotProjects.length === 0 ? (
                <EmptyState
                  title="No project pressure right now"
                  description="Mission Control will surface projects here when approvals, failures, or blocked work need review."
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
            title="Approvals Waiting"
            description="Requests currently blocking progress."
          >
            <div className="space-y-3">
              {data.pendingApprovals.length === 0 ? (
                <EmptyState
                  title="No approvals waiting"
                  description="When agents need human approval, the blocking request will appear here."
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
            title="Ready Work"
            description="Items ready for operator action."
          >
            <div className="space-y-3">
              {data.readyWorkItems.length === 0 ? (
                <EmptyState
                  title="No ready work items"
                  description="Project work that is ready for operator action will appear here."
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
            title="Failure Signals"
            description="Recent failures and degraded execution."
          >
            <div className="space-y-3">
              {data.failures.length === 0 ? (
                <EmptyState
                  title="No active failure signals"
                  description="Runtime incidents, failed agents, and degraded execution signals will collect here."
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
