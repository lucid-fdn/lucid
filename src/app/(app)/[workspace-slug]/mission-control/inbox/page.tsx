import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowUpRight, Inbox, TimerReset, TriangleAlert, UserCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { requireUserId } from '@/lib/auth/server-utils'
import { listNeedsHumanItems } from '@/lib/mission-control/needs-human'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import type { NeedsHumanItem } from '@contracts/lucid-doctor'

export default async function MissionControlInboxPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) return null

  const items = await withInboxTimeout(listNeedsHumanItems({ orgId: workspace.id, limit: 150 }), [])
  const urgent = items.filter((item) => item.priority === 'urgent').length
  const high = items.filter((item) => item.priority === 'high').length
  const blockedRuns = items.filter((item) => item.resourceType === 'agent_ops_run').length
  const domains = new Set(items.map((item) => item.domain)).size

  return (
    <MissionControlSectionShell
      title="Needs Human"
      description="A single inbox for blocked runs, knowledge fixes, Browser Operator alerts, commerce exceptions, template drift, and system notices."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <section className="grid gap-4 md:grid-cols-4">
            <InboxMetric title="Open items" value={items.length} icon={<Inbox className="h-4 w-4 text-primary" />} />
            <InboxMetric title="Urgent" value={urgent} icon={<TriangleAlert className="h-4 w-4 text-red-500" />} />
            <InboxMetric title="High priority" value={high} icon={<TimerReset className="h-4 w-4 text-amber-500" />} />
            <InboxMetric title="Domains" value={domains} icon={<UserCheck className="h-4 w-4 text-emerald-500" />} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Human Review Queue</CardTitle>
              <CardDescription>
                Sorted by priority and recency. Each item links back to the owning surface instead of inventing another workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                  <p className="text-sm font-semibold text-foreground">Nothing needs a human right now.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Blocked Agent Ops runs, Browser Operator alerts, knowledge maintenance, commerce exceptions, and template drift will appear here.
                  </p>
                </div>
              ) : items.map((item) => (
                <NeedsHumanCard key={item.id} item={item} workspaceSlug={workspaceSlug} />
              ))}
            </CardContent>
          </Card>

          {blockedRuns > 0 ? (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="text-sm">Operator note</CardTitle>
                <CardDescription>
                  {blockedRuns} Agent Ops run{blockedRuns === 1 ? '' : 's'} need a decision. Resolve these before trusting automation health scores.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
        </div>
      </div>
    </MissionControlSectionShell>
  )
}

function InboxMetric({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">current workspace</p>
      </CardContent>
    </Card>
  )
}

function NeedsHumanCard({ item, workspaceSlug }: { item: NeedsHumanItem; workspaceSlug: string }) {
  const action = item.actions[0]
  const href = typeof action?.href === 'string' ? qualifyMissionControlHref(action.href, workspaceSlug) : null
  return (
    <article className="rounded-xl border bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.priority === 'urgent' ? 'destructive' : 'secondary'}>{item.priority}</Badge>
            <Badge variant="outline" className="capitalize">{item.domain.replace(/_/g, ' ')}</Badge>
            <Badge variant="outline">{item.status}</Badge>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{item.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>
        </div>
        {href ? (
          <Button asChild size="sm" variant="outline">
            <Link href={href}>
              {typeof action?.label === 'string' ? action.label : 'Open'}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{new Date(item.createdAt).toLocaleString()}</span>
        {item.resourceType ? <span>Resource: {item.resourceType}</span> : null}
        {item.resourceId ? <span>ID: {item.resourceId.slice(0, 8)}</span> : null}
        {item.runId ? <span>Run: {item.runId.slice(0, 8)}</span> : null}
      </div>
    </article>
  )
}

function qualifyMissionControlHref(href: string, workspaceSlug: string): string {
  if (href.startsWith('http') || href.startsWith(`/${workspaceSlug}/`)) return href
  if (href.startsWith('/mission-control')) return `/${workspaceSlug}${href}`
  return href
}

function withInboxTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 12_000): Promise<T> {
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
