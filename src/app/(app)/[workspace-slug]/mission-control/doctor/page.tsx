import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Stethoscope, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { requireUserId } from '@/lib/auth/server-utils'
import { buildLucidDoctorReport } from '@/lib/doctor/lucid-doctor'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import type { LucidDoctorFinding } from '@contracts/lucid-doctor'

export default async function MissionControlDoctorPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) return null

  const report = await withDoctorTimeout(
    buildLucidDoctorReport({ orgId: workspace.id, limit: 150 }),
    {
      orgId: workspace.id,
      generatedAt: new Date().toISOString(),
      status: 'needs_attention',
      findings: [{
        id: 'doctor:timeout',
        domain: 'env',
        severity: 'warning',
        title: 'Lucid Doctor timed out',
        summary: 'One or more diagnostic sources took too long to answer. Try again or inspect System health.',
        scope: { orgId: workspace.id, projectId: null, resourceType: 'doctor', resourceId: null },
        evidence: [],
        remediation: [{ kind: 'ui_action', label: 'Open System', href: `/${workspaceSlug}/mission-control/system`, destructive: false }],
        dedupeKey: 'doctor:timeout',
      }],
      summary: { total: 1, critical: 0, warning: 1, watch: 0 },
    },
  )
  const domainCounts = countByDomain(report.findings)

  return (
    <MissionControlSectionShell
      title="Lucid Doctor"
      description="One readiness report across Knowledge, Agent Ops, Browser Operator, Commerce, Templates, runtimes, channels, and L2."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <section className="grid gap-4 md:grid-cols-4">
            <Card className="md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Readiness
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {report.status === 'ready' ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <TriangleAlert className="h-5 w-5 text-amber-500" />}
                  <p className="text-2xl font-semibold capitalize text-foreground">{report.status.replace(/_/g, ' ')}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Generated {new Date(report.generatedAt).toLocaleString()}</p>
              </CardContent>
            </Card>
            <DoctorMetric title="Critical" value={report.summary.critical} tone="critical" />
            <DoctorMetric title="Warnings" value={report.summary.warning} tone="warning" />
            <DoctorMetric title="Watch" value={report.summary.watch} tone="watch" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Coverage</CardTitle>
                <CardDescription>Subsystems currently contributing to the diagnosis.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(domainCounts).length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No findings right now. That is good news, but Doctor still keeps watching the connected systems.
                  </p>
                ) : Object.entries(domainCounts).map(([domain, count]) => (
                  <div key={domain} className="flex items-center justify-between rounded-lg border bg-card/60 px-3 py-2">
                    <span className="text-sm font-medium capitalize text-foreground">{domain.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Findings</CardTitle>
                <CardDescription>Deduped by source and severity so operators see what matters first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.findings.length === 0 ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                    <p className="text-sm font-medium text-foreground">No human action needed.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Knowledge, Browser Operator, Agent Ops, Templates, Commerce, and System signals are currently quiet.</p>
                  </div>
                ) : report.findings.slice(0, 12).map((finding) => (
                  <DoctorFindingCard key={finding.id} finding={finding} workspaceSlug={workspaceSlug} />
                ))}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </MissionControlSectionShell>
  )
}

function DoctorMetric({ title, value, tone }: { title: string; value: number; tone: 'critical' | 'warning' | 'watch' }) {
  const color = tone === 'critical' ? 'text-red-500' : tone === 'warning' ? 'text-amber-500' : 'text-sky-500'
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {tone === 'watch' ? <Info className={`h-4 w-4 ${color}`} /> : <AlertTriangle className={`h-4 w-4 ${color}`} />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground">deduped finding{value === 1 ? '' : 's'}</p>
      </CardContent>
    </Card>
  )
}

function DoctorFindingCard({ finding, workspaceSlug }: { finding: LucidDoctorFinding; workspaceSlug: string }) {
  const remediation = finding.remediation[0]
  const href = remediation?.href ? qualifyMissionControlHref(remediation.href, workspaceSlug) : null
  return (
    <article className="rounded-xl border bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={finding.severity === 'critical' ? 'destructive' : 'secondary'}>{finding.severity}</Badge>
            <Badge variant="outline" className="capitalize">{finding.domain.replace(/_/g, ' ')}</Badge>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{finding.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{finding.summary}</p>
        </div>
        {href ? (
          <Button asChild size="sm" variant="outline">
            <Link href={href}>
              {remediation?.label ?? 'Open'}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {finding.scope.resourceType ? <span>Resource: {finding.scope.resourceType}</span> : null}
        {finding.scope.resourceId ? <span>ID: {finding.scope.resourceId.slice(0, 8)}</span> : null}
        <span>Dedupe: {finding.dedupeKey}</span>
      </div>
    </article>
  )
}

function qualifyMissionControlHref(href: string, workspaceSlug: string): string {
  if (href.startsWith('http') || href.startsWith(`/${workspaceSlug}/`)) return href
  if (href.startsWith('/mission-control')) return `/${workspaceSlug}${href}`
  return href
}

function countByDomain(findings: LucidDoctorFinding[]): Record<string, number> {
  return findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.domain] = (acc[finding.domain] ?? 0) + 1
    return acc
  }, {})
}

function withDoctorTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 12_000): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timeout)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timeout)
        resolve(fallback)
      })
  })
}
