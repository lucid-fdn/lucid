'use client'

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Brain,
  Command,
  Network,
  PanelsTopLeft,
  Radar,
  Sparkles,
} from 'lucide-react'
import { useRealtimeMetrics } from '@/hooks/use-realtime-metrics'
import { FleetKPIStrip } from './fleet-kpi-strip'
import { AgentHealthGrid } from './agent-health-grid'
import { ActionItemsPanel } from './action-items-panel'
import { DashboardZeroAgentsState } from './dashboard-zero-agents-state'
import { WorkspaceBrainSummaryCard } from './workspace-brain-summary-card'
import type { Agent as Assistant } from '@/types/agent'
import { PageHeader } from '@/components/page/page-header'
import { PageSection } from '@/components/page/page-section'
import { PageShell } from '@/components/page/page-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  buildProjectAgentBuilderPath,
  buildProjectAgentsPath,
  buildProjectOverviewPath,
  buildWorkspaceMissionControlOverviewPath,
} from '@/lib/projects/urls'
import { cn } from '@/lib/utils'

interface FleetDashboardProps {
  agents: Assistant[]
  orgId: string
  workspaceSlug: string
  primaryProject: {
    name: string
    slug: string
  }
  healthScores: Record<string, number | null>
}

export function FleetDashboard({
  agents,
  orgId,
  workspaceSlug,
  primaryProject,
  healthScores,
}: FleetDashboardProps) {
  const { data: metrics } = useRealtimeMetrics(orgId)
  const projectHref = buildProjectOverviewPath(workspaceSlug, primaryProject.slug)
  const agentsHref = buildProjectAgentsPath(workspaceSlug, primaryProject.slug)
  const createAgentHref = buildProjectAgentBuilderPath(workspaceSlug, primaryProject.slug)
  const missionControlHref = buildWorkspaceMissionControlOverviewPath(workspaceSlug)
  const workspaceBrainHref = `/${workspaceSlug}/knowledge?tab=context`
  const projectsHref = `/${workspaceSlug}/projects`
  const workspaceContextEndpoint = `/api/workspaces/${orgId}/context`

  const { healthyCount, needsAttentionCount } = useMemo(() => {
    let healthy = 0
    let needsAttention = 0
    for (const agent of agents) {
      const score = healthScores[agent.id]
      const hasError = score != null && score < 60
      const isPaused = !(agent.is_active ?? true)
      if (hasError || isPaused) {
        needsAttention++
      } else {
        healthy++
      }
    }
    // Also count pending approvals and errors as needing attention
    if (metrics.pending_approvals > 0 || metrics.errors_24h > 0) {
      needsAttention = Math.max(needsAttention, 1)
    }
    return { healthyCount: healthy, needsAttentionCount: needsAttention }
  }, [agents, healthScores, metrics.pending_approvals, metrics.errors_24h])

  const statusTone = needsAttentionCount > 0
    ? 'attention'
    : metrics.active_agents > 0
      ? 'live'
      : 'quiet'
  const activePercent = agents.length > 0
    ? Math.round((metrics.active_agents / agents.length) * 100)
    : 0

  if (agents.length === 0) {
    return (
      <DashboardZeroAgentsState
        workspaceSlug={workspaceSlug}
        projectName={primaryProject.name}
        projectSlug={primaryProject.slug}
      />
    )
  }

  return (
    <PageShell contentClassName="max-w-7xl gap-6 p-6">
      <PageHeader
        className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_34%),linear-gradient(135deg,hsl(var(--card)/0.96),hsl(var(--background)/0.9))] px-6 py-6 shadow-sm"
        eyebrow={
          <>
            <Badge
              variant="outline"
              className={cn(
                'rounded-full border-border/70 bg-background/60 px-2.5 py-1 text-[11px] font-medium',
                statusTone === 'live' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
                statusTone === 'attention' && 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300',
              )}
            >
              {statusTone === 'attention' ? 'Needs attention' : statusTone === 'live' ? 'Live workspace' : 'Quiet workspace'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {agents.length} agent{agents.length === 1 ? '' : 's'} across the active project
            </span>
          </>
        }
        title="Workspace home"
        description={`Start from ${primaryProject.name}, keep the shared workspace brain aligned, and jump directly to the agents or operations surface that needs attention.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="rounded-full bg-background/70">
              <Link href={projectHref}>
                <PanelsTopLeft className="h-4 w-4" />
                Open project
              </Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href={createAgentHref}>
                <Network className="h-4 w-4" />
                New agent
              </Link>
            </Button>
          </div>
        }
      />

      <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-border/70 bg-card/55 p-5 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                <Command className="h-3.5 w-3.5" />
                Next best action
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {needsAttentionCount > 0
                    ? 'Clear operational blockers first'
                    : 'Keep building from the agents canvas'}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {needsAttentionCount > 0
                    ? 'Approvals, degraded agents, or recent errors need review before scaling the workspace.'
                    : 'The workspace is stable. Review the current topology, add the next agent, or open Mission Control for live operations.'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild variant={needsAttentionCount > 0 ? 'default' : 'outline'} className="rounded-full">
                <Link href={missionControlHref}>
                  <Radar className="h-4 w-4" />
                  Mission Control
                </Link>
              </Button>
              <Button asChild variant={needsAttentionCount > 0 ? 'outline' : 'default'} className="rounded-full">
                <Link href={agentsHref}>
                  Agents canvas
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-[24px] border border-border/70 bg-card/55 shadow-sm">
          <WorkspaceSignal label="Active" value={`${activePercent}%`} detail={`${metrics.active_agents}/${agents.length} agents`} />
          <WorkspaceSignal label="Runs" value={metrics.total_runs_24h > 0 ? String(metrics.total_runs_24h) : '0'} detail="last 24h" />
          <WorkspaceSignal label="Errors" value={metrics.errors_24h > 0 ? String(metrics.errors_24h) : '0'} detail="last 24h" tone={metrics.errors_24h > 0 ? 'danger' : 'muted'} />
        </div>
      </section>

      <FleetKPIStrip
        metrics={metrics}
        healthyCount={healthyCount}
        needsAttentionCount={needsAttentionCount}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <WorkspaceBrainSummaryCard
            endpoint={workspaceContextEndpoint}
            workspaceBrainHref={workspaceBrainHref}
          />

          <PageSection
            title="Agent fleet"
            description="Health, runtime status, channels, and model identity for every live agent in this workspace."
            actions={
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href={agentsHref}>
                  Open canvas
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
            contentClassName="p-4"
          >
            <AgentHealthGrid
              agents={agents}
              workspaceSlug={workspaceSlug}
              healthScores={healthScores}
            />
          </PageSection>
        </div>

        <aside className="space-y-4">
          <ProjectFocusCard
            projectName={primaryProject.name}
            projectHref={projectHref}
            projectsHref={projectsHref}
            workspaceBrainHref={workspaceBrainHref}
          />
          <ActionItemsPanel
            metrics={metrics}
            agents={agents}
            healthScores={healthScores}
          />
        </aside>
      </div>
    </PageShell>
  )
}

function WorkspaceSignal({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'danger' | 'muted'
}) {
  return (
    <div className="border-r border-border/60 px-4 py-5 last:border-r-0">
      <div
        className={cn(
          'font-mono text-3xl font-semibold tabular-nums tracking-tight',
          tone === 'danger' ? 'text-red-400' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground/80">{detail}</div>
    </div>
  )
}

function ProjectFocusCard({
  projectName,
  projectHref,
  projectsHref,
  workspaceBrainHref,
}: {
  projectName: string
  projectHref: string
  projectsHref: string
  workspaceBrainHref: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/55">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Workspace map
        </div>
      </div>
      <div className="space-y-2 p-3">
        <QuickLink
          href={projectHref}
          icon={<Sparkles className="h-4 w-4" />}
          title={projectName}
          description="Project home and operating overview"
        />
        <QuickLink
          href={workspaceBrainHref}
          icon={<Brain className="h-4 w-4" />}
          title="Workspace Brain"
          description="Thesis, facts, risks, decisions, and policy"
        />
        <QuickLink
          href={projectsHref}
          icon={<PanelsTopLeft className="h-4 w-4" />}
          title="All projects"
          description="Browse every project in the workspace"
        />
      </div>
    </div>
  )
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border/70 hover:bg-background/60"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/70 text-muted-foreground transition-colors group-hover:text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {title}
          <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  )
}
