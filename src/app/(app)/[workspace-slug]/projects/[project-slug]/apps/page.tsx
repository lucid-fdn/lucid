import {
  EmptyState,
  PageHeader,
  PageSection,
  PageShell,
} from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { WorkspaceMetricCard } from '@/components/workspace/workspace-metric-card'
import { listAppDeployments } from '@/lib/app-service/deployments'
import { assertAppServiceSurfacesEnabled } from '@/lib/app-service/feature-gates'
import { getAppServiceOperatorVisibility } from '@/lib/app-service/operator-visibility'
import { requireUserId } from '@/lib/auth/server-utils'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import {
  buildProjectAppDetailPath,
  buildProjectTemplatesPath,
} from '@/lib/projects/urls'
import type { AppDeployment } from '@contracts/app-service'
import {
  ArrowUpRight,
  Box,
  ExternalLink,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-600',
  preview: 'bg-blue-500/15 text-blue-600',
  paused: 'bg-amber-500/15 text-amber-600',
  failed: 'bg-red-500/15 text-red-600',
  archived: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
}

function statusBadge(status: string) {
  return (
    <Badge
      className={STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'}
    >
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'None'
}

function AppCard({
  app,
  workspaceSlug,
  projectSlug,
  health,
  externalUrl,
}: {
  app: AppDeployment
  workspaceSlug: string
  projectSlug: string
  health: {
    validation_passed?: boolean
    sandbox_passed?: boolean
    has_failed_provider_step: boolean
    last_event_at?: string
  }
  externalUrl?: string | null
}) {
  const detailHref = buildProjectAppDetailPath(
    workspaceSlug,
    projectSlug,
    app.id,
  )

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">
              {app.name}
            </h2>
            {statusBadge(app.status)}
            {health.has_failed_provider_step ? (
              <Badge className="bg-red-500/15 text-red-600">Needs Review</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">/{app.slug}</p>
        </div>
        <Link
          href={detailHref}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:border-primary/50"
        >
          Open cockpit
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Source guard
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {health.validation_passed ? 'Passed' : 'Pending'}
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Box className="h-4 w-4 text-muted-foreground" />
            Sandbox
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {health.sandbox_passed ? 'Passed' : 'Pending'}
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium text-foreground">Last event</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(health.last_event_at)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {app.preview_url ? (
          <Link
            href={app.preview_url}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            Preview
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            Live deployment
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

export default async function ProjectAppsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string }>
}) {
  try {
    assertAppServiceSurfacesEnabled(['foundry'])
  } catch {
    notFound()
  }

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
  const apps = await listAppDeployments({
    orgId: workspace.id,
    projectId: project.id,
    limit: 100,
  })
  const visibilityByAppId = new Map(
    await Promise.all(
      apps
        .slice(0, 50)
        .map(
          async (app) =>
            [app.id, await getAppServiceOperatorVisibility(app)] as const,
        ),
    ),
  )
  const activeApps = apps.filter((app) => app.status === 'active').length
  const previewApps = apps.filter((app) => app.status === 'preview').length
  const needsReview = apps.filter(
    (app) => visibilityByAppId.get(app.id)?.health.has_failed_provider_step,
  ).length

  return (
    <PageShell contentClassName="gap-6 px-6 py-6">
      <PageHeader
        className="rounded-2xl border border-b border-border/70 bg-card/40 px-5 py-4"
        title="Apps"
        description="Discover generated AI services, inspect provider health, and open the operator cockpit for rollback and launch decisions."
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-border text-muted-foreground"
            >
              Project
            </Badge>
            <Badge className="bg-primary/10 text-primary">App Foundry</Badge>
          </div>
        }
        actions={
          <Link
            href={buildProjectTemplatesPath(workspaceSlug, projectSlug)}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50"
          >
            <Plus className="h-4 w-4" />
            Start from template
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <WorkspaceMetricCard
          label="Total Apps"
          value={apps.length}
          detail="Generated services in this project"
        />
        <WorkspaceMetricCard
          label="Active"
          value={activeApps}
          detail="Publicly active deployments"
        />
        <WorkspaceMetricCard
          label="Preview"
          value={previewApps}
          detail="Ready for operator review"
        />
        <WorkspaceMetricCard
          label="Needs Review"
          value={needsReview}
          detail="Provider failures or unsafe states"
          tone={needsReview > 0 ? 'warning' : 'default'}
        />
      </div>

      <PageSection
        title="Generated Apps"
        description="Open a cockpit to review validation reports, build logs, deployment receipts, and rollback targets."
        contentClassName="space-y-4"
      >
        {apps.length === 0 ? (
          <EmptyState
            title="No generated apps yet"
            description="Generate an App Foundry service from a blueprint or approved generation run, then it will appear here."
            className="min-h-0 p-8"
          />
        ) : (
          apps.map((app) => {
            const visibility = visibilityByAppId.get(app.id)
            return (
              <AppCard
                key={app.id}
                app={app}
                workspaceSlug={workspaceSlug}
                projectSlug={project.slug}
                health={{
                  validation_passed: visibility?.health.validation_passed,
                  sandbox_passed: visibility?.health.sandbox_passed,
                  has_failed_provider_step:
                    visibility?.health.has_failed_provider_step ?? false,
                  last_event_at: visibility?.health.last_event_at,
                }}
                externalUrl={visibility?.links.external_url ?? app.public_url}
              />
            )
          })
        )}
      </PageSection>
    </PageShell>
  )
}
