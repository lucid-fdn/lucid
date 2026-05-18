'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Bot, Clock3, GitBranch, Loader2, RefreshCw, ShieldCheck, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/mission-control/empty-state'
import { KPICard } from '@/components/mission-control/kpi-card'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type {
  NativeMutationCandidateRecord,
  NativeMutationOpsSummary,
} from '@/lib/db/mission-control'
import {
  formatCandidateStatusLabel,
  formatMutationKindLabel,
  getCandidateStatusBadgeClass,
  getNativeMutationOpsHealth,
} from '@/lib/mission-control/native-mutations'

type StatusFilter = 'all' | NativeMutationCandidateRecord['status']
type KindFilter = 'all' | NativeMutationCandidateRecord['mutation_kind']

interface ProposedChangesClientProps {
  orgId: string
  workspaceSlug: string
  initialSummary: NativeMutationOpsSummary
  initialCandidates: NativeMutationCandidateRecord[]
}

export function ProposedChangesClient({
  orgId,
  workspaceSlug: _workspaceSlug,
  initialSummary,
  initialCandidates,
}: ProposedChangesClientProps) {
  const [summary, setSummary] = useState(initialSummary)
  const [candidates, setCandidates] = useState(initialCandidates)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [failuresOnly, setFailuresOnly] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const params = new URLSearchParams({ org_id: orgId, limit: '100' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (kindFilter !== 'all') params.set('mutation_kind', kindFilter)
      if (failuresOnly) params.set('failures_only', 'true')
      const res = await fetch(`/api/mission-control/native-mutations?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load proposed changes')
      const data = await res.json()
      setSummary(data.summary ?? initialSummary)
      setCandidates(data.candidates ?? [])
    } finally {
      setIsRefreshing(false)
    }
  }, [failuresOnly, initialSummary, kindFilter, orgId, statusFilter])

  const reviewCandidate = useCallback(async (
    candidate: NativeMutationCandidateRecord,
    action: 'approve' | 'reject' | 'promote',
    promotionScope?: 'assistant_durable' | 'org_durable',
  ) => {
    setBusyAction(`${candidate.id}:${action}:${promotionScope ?? 'none'}`)
    try {
      let csrfToken = getCSRFTokenFromCookie()
      if (!csrfToken) {
        await fetch('/api/auth/csrf').catch(() => {})
        csrfToken = getCSRFTokenFromCookie()
      }

      const res = await fetch(`/api/mission-control/native-mutations?org_id=${orgId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'x-csrf-token': csrfToken }),
        },
        body: JSON.stringify({
          candidateId: candidate.id,
          assistantId: candidate.agent_id,
          action,
          promotionScope: promotionScope ?? null,
          reviewNotes: reviewNotes[candidate.id] ?? null,
        }),
      })
      if (!res.ok) {
        if (res.status === 409) {
          await refresh()
          toast.info('This candidate was already reviewed by another operator.')
          return
        }
        throw new Error(`Failed to ${action} candidate`)
      }
      await refresh()
      setReviewNotes((prev) => ({ ...prev, [candidate.id]: '' }))
    } finally {
      setBusyAction(null)
    }
  }, [orgId, refresh, reviewNotes])

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (failuresOnly && !candidate.last_error_at) return false
      if (statusFilter !== 'all' && candidate.status !== statusFilter) return false
      if (kindFilter !== 'all' && candidate.mutation_kind !== kindFilter) return false
      return true
    })
  }, [candidates, failuresOnly, kindFilter, statusFilter])

  const health = getNativeMutationOpsHealth(summary)

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Proposed Changes</h2>
          <p className="text-xs text-muted-foreground">
            Review memory and skill changes before they become durable workspace state.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KPICard label="Pending Review" value={summary.pendingCount} icon={Clock3} variant={health.backlogVariant} />
        <KPICard label="Reviewed 24h" value={summary.reviewedLast24h} icon={ShieldCheck} />
        <KPICard label="Promoted 24h" value={summary.promotedLast24h} icon={GitBranch} variant="success" />
        <KPICard label="Failures 24h" value={summary.failedLast24h} icon={AlertTriangle} variant={health.failureVariant} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_360px]">
        <section className="rounded-lg border border-border/60 bg-background">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
            {(['all', 'pending', 'applying', 'approved', 'rejected', 'promoted'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  statusFilter === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {value === 'all' ? 'All statuses' : formatCandidateStatusLabel(value)}
              </button>
            ))}
            {(['all', 'memory_write', 'skill_create', 'skill_update', 'skill_delete'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKindFilter(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  kindFilter === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {value === 'all' ? 'All kinds' : formatMutationKindLabel(value)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFailuresOnly((prev) => !prev)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                failuresOnly ? 'bg-red-500/10 text-red-400' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              Failures only
            </button>
          </div>

          <div className="divide-y divide-border/60">
            {filteredCandidates.length === 0 ? (
              <EmptyState
                icon={<Wrench className="h-6 w-6" />}
                title="No matching proposed changes"
                description="Adjust the filters or wait for the next memory or skill proposal."
                className="py-16"
              />
            ) : (
              filteredCandidates.map((candidate) => {
                const pending = candidate.status === 'pending'
                const busyKey = busyAction ?? ''
                return (
                  <div key={candidate.id} className="space-y-3 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {formatMutationKindLabel(candidate.mutation_kind)}
                          </p>
                          <Badge variant="outline" className="h-5 border-border text-[10px] text-muted-foreground">
                            {candidate.engine}
                          </Badge>
                          <Badge variant="outline" className="h-5 border-border text-[10px] text-muted-foreground">
                            {candidate.runtime_flavor}
                          </Badge>
                          <Badge className={cn('h-5 text-[10px]', getCandidateStatusBadgeClass(candidate.status))}>
                            {formatCandidateStatusLabel(candidate.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Assistant <span className="font-mono text-foreground/80">{candidate.agent_id.slice(0, 8)}</span> · {candidate.reason} · {formatDistanceToNow(new Date(candidate.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {candidate.last_error ? (
                        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1 text-[10px] text-red-400">
                          Failed {candidate.review_attempts}x
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <div>Tool: <span className="text-foreground/80">{candidate.tool_name}</span></div>
                      <div>Source: <span className="text-foreground/80">{candidate.source}</span></div>
                      {candidate.promotion_scope ? <div>Scope: <span className="text-foreground/80">{candidate.promotion_scope}</span></div> : null}
                      {candidate.applied_record_id ? <div>Applied record: <span className="font-mono text-foreground/80">{candidate.applied_record_id.slice(0, 8)}</span></div> : null}
                    </div>

                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Args</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                        {JSON.stringify(candidate.tool_args)}
                      </p>
                    </div>

                    {candidate.last_error ? (
                      <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                        <div className="font-medium">Last failure</div>
                        <div className="mt-1">{candidate.last_error}</div>
                        {candidate.last_error_at ? (
                          <div className="mt-1 text-[11px] text-red-300/80">
                            {formatDistanceToNow(new Date(candidate.last_error_at), { addSuffix: true })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {pending ? (
                      <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 px-3 py-3">
                        <Textarea
                          rows={2}
                          value={reviewNotes[candidate.id] ?? ''}
                          onChange={(event) => setReviewNotes((prev) => ({ ...prev, [candidate.id]: event.target.value }))}
                          placeholder="Review notes (optional)"
                          className="min-h-[56px] text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyAction !== null} onClick={() => void reviewCandidate(candidate, 'approve')}>
                            {busyKey === `${candidate.id}:approve:none` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busyAction !== null} onClick={() => void reviewCandidate(candidate, 'reject')}>
                            {busyKey === `${candidate.id}:reject:none` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Reject
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyAction !== null} onClick={() => void reviewCandidate(candidate, 'promote', 'assistant_durable')}>
                            {busyKey === `${candidate.id}:promote:assistant_durable` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Promote to agent
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyAction !== null} onClick={() => void reviewCandidate(candidate, 'promote', 'org_durable')}>
                            {busyKey === `${candidate.id}:promote:org_durable` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Promote to org
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border/60 bg-background p-4">
            <h3 className="text-sm font-medium">Backlog shape</h3>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between"><span>Oldest pending</span><span className="text-foreground/80">{summary.oldestPendingCreatedAt ? formatDistanceToNow(new Date(summary.oldestPendingCreatedAt), { addSuffix: true }) : 'None'}</span></div>
              {Object.entries(summary.pendingByEngine).map(([engine, count]) => (
                <div key={engine} className="flex items-center justify-between"><span className="capitalize">{engine}</span><span className="text-foreground/80">{count}</span></div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border/60 bg-background p-4">
            <h3 className="text-sm font-medium">Recent failures</h3>
            <div className="mt-3 space-y-3">
              {summary.recentFailures.length === 0 ? (
                <EmptyState icon={<Bot className="h-5 w-5" />} title="No recent failures" description="Failed promotion attempts will appear here for operators." className="py-8" />
              ) : (
                summary.recentFailures.map((candidate) => (
                  <div key={candidate.id} className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground">{formatMutationKindLabel(candidate.mutation_kind)}</p>
                      <Badge className="h-5 bg-red-500/15 text-[10px] text-red-400">{candidate.engine}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-red-400">{candidate.last_error}</p>
                    {candidate.last_error_at ? (
                      <p className="mt-1 text-[10px] text-red-300/80">{formatDistanceToNow(new Date(candidate.last_error_at), { addSuffix: true })}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
