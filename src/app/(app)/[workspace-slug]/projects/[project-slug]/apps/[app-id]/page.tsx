import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Box,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  ExternalLink,
  FileCode2,
  Gauge,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import type { AppArtifact, AppDeploymentEvent } from '@contracts/app-service'
import type { OperatorArtifactSummary } from '@/lib/app-service/operator-visibility-core'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUserId } from '@/lib/auth/server-utils'
import { assertAppServiceSurfacesEnabled } from '@/lib/app-service/feature-gates'
import { getAppDeployment } from '@/lib/app-service/deployments'
import { getAppServiceOperatorVisibility } from '@/lib/app-service/operator-visibility'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { AppBetaFeedback } from './app-beta-feedback'
import { AppCommerceActions } from './commerce-actions'
import { RollbackActions } from './rollback-actions'
import { AppSettingsActions } from './settings-actions'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-600',
  ready: 'bg-emerald-500/15 text-emerald-600',
  preview: 'bg-blue-500/15 text-blue-600',
  paused: 'bg-amber-500/15 text-amber-700',
  building: 'bg-blue-500/15 text-blue-600',
  generating: 'bg-blue-500/15 text-blue-600',
  queued: 'bg-muted text-muted-foreground',
  failed: 'bg-red-500/15 text-red-600',
  cancelled: 'bg-muted text-muted-foreground',
  archived: 'bg-muted text-muted-foreground',
}

function formatLabel(value: string | null | undefined) {
  return value?.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) ?? 'None'
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'None'
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatCents(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value / 100)
}

function formatPercent(value: number | null) {
  return value === null ? 'No cap' : `${value}%`
}

function statusBadge(status: string | null | undefined) {
  return (
    <Badge className={STATUS_STYLES[status ?? ''] ?? 'bg-muted text-muted-foreground'}>
      {formatLabel(status)}
    </Badge>
  )
}

function readinessBadge(status: 'ready' | 'warning' | 'blocked') {
  if (status === 'ready') {
    return <Badge className="bg-emerald-500/15 text-emerald-600">Launch Ready</Badge>
  }
  if (status === 'warning') {
    return <Badge className="bg-amber-500/15 text-amber-700">Review Warnings</Badge>
  }
  return <Badge className="bg-red-500/15 text-red-600">Launch Blocked</Badge>
}

function abuseBadge(status: 'clear' | 'watch' | 'blocked') {
  if (status === 'clear') {
    return <Badge className="bg-emerald-500/15 text-emerald-600">Clear</Badge>
  }
  if (status === 'watch') {
    return <Badge className="bg-amber-500/15 text-amber-700">Watch</Badge>
  }
  return <Badge className="bg-red-500/15 text-red-600">Blocked</Badge>
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'number' ? value : null
}

function metadataBoolean(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'boolean' ? value : null
}

function LinkButton({
  href,
  label,
}: {
  href?: string | null
  label: string
}) {
  if (!href) return null
  const isExternal = href.startsWith('http')
  const className = 'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50'

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
        <ArrowUpRight className="h-4 w-4" />
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      {label}
      <ExternalLink className="h-4 w-4" />
    </Link>
  )
}

function ArtifactRow({ artifact }: { artifact: OperatorArtifactSummary }) {
  const files = Array.isArray(artifact.metadata.files) ? artifact.metadata.files : []
  const logLines = Array.isArray(artifact.metadata.logs) ? artifact.metadata.logs : []

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <p className="truncate text-sm font-medium text-foreground">{formatLabel(artifact.kind)}</p>
          <Badge variant="outline">v{artifact.version}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">{formatDate(artifact.created_at)}</p>
      </div>
      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Checksum {artifact.checksum.slice(0, 10)}</span>
        {metadataNumber(artifact.metadata, 'file_count') !== null ? (
          <span>{metadataNumber(artifact.metadata, 'file_count')} files</span>
        ) : null}
        {metadataNumber(artifact.metadata, 'total_bytes') !== null ? (
          <span>{metadataNumber(artifact.metadata, 'total_bytes')} bytes</span>
        ) : null}
      </div>
      {files.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.slice(0, 8).map((file, index) => {
            const record = file && typeof file === 'object' ? file as Record<string, unknown> : {}
            return (
              <Badge key={`${artifact.id}-${index}`} variant="outline" className="max-w-full truncate">
                {typeof record.path === 'string' ? record.path : 'file'}
              </Badge>
            )
          })}
        </div>
      ) : null}
      {logLines.length > 0 ? (
        <pre className="mt-3 max-h-52 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
          {logLines.slice(-12).join('\n')}
        </pre>
      ) : null}
    </div>
  )
}

function TimelineRow({ event }: { event: AppDeploymentEvent }) {
  const Icon = event.severity === 'error' ? XCircle : event.severity === 'warning' ? ClipboardList : CheckCircle2

  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <Icon className={event.severity === 'error' ? 'mt-0.5 h-4 w-4 text-red-600' : 'mt-0.5 h-4 w-4 text-muted-foreground'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{formatLabel(event.event_type)}</p>
          <Badge variant="outline">{event.severity}</Badge>
          {event.provider ? <Badge variant="outline">{event.provider}</Badge> : null}
        </div>
        {event.message ? <p className="mt-1 text-sm text-muted-foreground">{event.message}</p> : null}
        <p className="mt-2 text-[11px] text-muted-foreground">{formatDate(event.created_at)}</p>
      </div>
    </div>
  )
}

export default async function AppServiceDetailPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string; 'app-id': string }>
}) {
  try {
    assertAppServiceSurfacesEnabled(['foundry'])
  } catch {
    notFound()
  }

  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug, 'app-id': appId } = await params

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  const { workspace, project } = scope
  const app = await getAppDeployment(appId)
  if (!app || app.org_id !== workspace.id || app.project_id !== project.id) notFound()

  const visibility = await getAppServiceOperatorVisibility(app)
  const latestBuildLog = visibility.latest.build_log
  const latestEval = visibility.latest.eval_report
  const latestReceipt = visibility.latest.deployment_receipt
  const dailyRequests = visibility.usage.daily_public_requests
  const monthlyCost = visibility.usage.monthly_chat_cost_cents
  const monthlyChats = visibility.usage.monthly_chat_completions
  const abuse = visibility.abuse
  const paymentEvents = visibility.timeline.filter((event) => (
    event.event_type === 'public_action_commerce_shadowed'
    || event.event_type === 'public_action_payment_required'
    || event.event_type === 'public_action_payment_claimed'
    || event.event_type === 'public_action_payment_denied'
  ))
  const readinessIssues = visibility.launch_readiness.blockers.length > 0
    ? visibility.launch_readiness.blockers
    : visibility.launch_readiness.warnings

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border text-muted-foreground">
            App Foundry
          </Badge>
          {statusBadge(app.status)}
          {visibility.health.has_failed_provider_step || abuse.status !== 'clear' ? (
            <Badge className="bg-red-500/15 text-red-600">Needs Review</Badge>
          ) : (
            <Badge className="bg-emerald-500/15 text-emerald-600">Healthy</Badge>
          )}
          {readinessBadge(visibility.launch_readiness.status)}
          {abuse.status !== 'clear' ? abuseBadge(abuse.status) : null}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{app.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Provider readiness, generated source checks, build logs, deployment receipts, and launch links for this generated AI service.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={visibility.links.preview_url} label="Preview" />
            <LinkButton href={visibility.links.external_url ?? visibility.links.public_url} label="Live App" />
            <LinkButton href={visibility.links.provider_web_url} label="v0" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Frontend</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              {statusBadge(visibility.health.frontend_status)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            v0 source generation and validation state
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sandbox Build</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Box className="h-5 w-5 text-muted-foreground" />
              {visibility.health.sandbox_passed ? 'Passed' : 'Pending'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Isolated generated-code build verification
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>External Deploy</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-muted-foreground" />
              {statusBadge(visibility.health.external_deployment_status)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            v0/Vercel deployment state
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Event</CardDescription>
            <CardTitle className="text-sm">{formatDate(visibility.health.last_event_at)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Most recent provider or app deployment event
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_0.8fr_0.9fr_1.2fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Daily Public Requests</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              {formatInteger(dailyRequests.current)}
              {dailyRequests.limit !== null ? (
                <span className="text-sm font-normal text-muted-foreground">/ {formatInteger(dailyRequests.limit)}</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${dailyRequests.percent ?? 0}%` }}
              />
            </div>
            <p>{formatPercent(dailyRequests.percent)} used today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly AI Cost</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gauge className="h-5 w-5 text-muted-foreground" />
              {formatCents(monthlyCost.current)}
              {monthlyCost.limit !== null ? (
                <span className="text-sm font-normal text-muted-foreground">/ {formatCents(monthlyCost.limit)}</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${monthlyCost.percent ?? 0}%` }}
              />
            </div>
            <p>{formatInteger(monthlyChats.current)} completed public chats this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Abuse Monitor</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              {formatInteger(abuse.blocked_public_runtime_24h)}
              <span className="text-sm font-normal text-muted-foreground">blocked</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <span>Origins {formatInteger(abuse.denied_origins_24h.current_24h)}</span>
              <span>Limits {formatInteger(abuse.rate_limited_24h.current_24h)}</span>
              <span>Cost caps {formatInteger(abuse.cost_cap_hits_24h.current_24h)}</span>
              <span>Reports {formatInteger(abuse.unsafe_feedback_24h.current_24h)}</span>
            </div>
            <div>{abuseBadge(abuse.status)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Launch Readiness</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Rocket className="h-5 w-5 text-muted-foreground" />
              {readinessBadge(visibility.launch_readiness.status)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {readinessIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">All beta launch gates are clear.</p>
            ) : (
              readinessIssues.slice(0, 4).map((item) => (
                <div key={item.code} className="flex gap-2 rounded-md border p-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Provider Timeline</CardTitle>
            <CardDescription>Newest provider and deployment events for this app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibility.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No provider events have been recorded yet.</p>
            ) : (
              visibility.timeline.slice(0, 10).map((event) => (
                <TimelineRow key={event.id} event={event} />
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>App Controls</CardTitle>
              <CardDescription>
                Manage public availability, app identity, theme, consent links, and launch limits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AppSettingsActions
                appId={app.id}
                name={app.name}
                slug={app.slug}
                status={app.status}
                visibility={app.visibility}
                frontendManifest={app.frontend_manifest}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Monetization
              </CardTitle>
              <CardDescription>
                Configure public action pricing and inspect recent payment proof events.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AppCommerceActions
                appId={app.id}
                frontendManifest={app.frontend_manifest}
                paymentEvents={paymentEvents}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Beta Feedback</CardTitle>
              <CardDescription>Operator notes are recorded in the app timeline for launch review.</CardDescription>
            </CardHeader>
            <CardContent>
              <AppBetaFeedback appId={app.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validation</CardTitle>
              <CardDescription>Source guard, sandbox, and deployment receipt state.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Source guard</p>
                  {visibility.health.validation_passed ? statusBadge('ready') : statusBadge('queued')}
                </div>
                {latestEval ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {metadataNumber(latestEval.metadata, 'file_count') ?? 0} files checked.
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Sandbox build</p>
                  {visibility.health.sandbox_passed ? statusBadge('ready') : statusBadge('queued')}
                </div>
                {latestBuildLog ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {metadataBoolean(latestBuildLog.metadata, 'passed') === false ? 'Build failed.' : 'Build log artifact captured.'}
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Deploy receipt</p>
                  {latestReceipt ? statusBadge('ready') : statusBadge('queued')}
                </div>
                {latestReceipt ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Receipt {latestReceipt.checksum.slice(0, 10)} recorded.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>External Deployments</CardTitle>
              <CardDescription>Recent provider deployments linked to this app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {visibility.external_deployments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No external deployments yet.</p>
              ) : (
                visibility.external_deployments.slice(0, 5).map((deployment) => (
                  <div key={deployment.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{deployment.provider}</p>
                        {statusBadge(deployment.status)}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{formatDate(deployment.updated_at)}</p>
                    </div>
                    {deployment.external_url ? (
                      <a href={deployment.external_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                        {deployment.external_url}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rollback</CardTitle>
              <CardDescription>
                Repoint the app to a previous safe manifest or source archive and record the decision in the timeline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RollbackActions
                appId={app.id}
                currentArtifactId={app.latest_artifact_id}
                artifacts={visibility.artifacts}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
          <CardDescription>Sanitized summaries of source archives, validation reports, build logs, and deployment receipts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {visibility.artifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No artifacts have been stored yet.</p>
          ) : (
            visibility.artifacts.slice(0, 12).map((artifact) => (
              <ArtifactRow key={artifact.id} artifact={artifact} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
