'use client'

/**
 * Work Items — Internal PM surface for the human work ledger.
 *
 * Shows standalone jobs and workflow handoffs side-by-side.
 * Left: filterable list (mine / open / done / all). Right: detail + activity.
 */

import React from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Inbox, CheckCircle2, XCircle, Loader2, Workflow, User, Clock, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CapabilityGate } from '@/components/mission-control/capability-gate'
import { EmptyState } from '@/components/mission-control/empty-state'
import { cn } from '@/lib/utils'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { useWorkItems, type WorkItemsFilter } from '@/hooks/use-work-items'
import type { WorkItemEvent } from '@/lib/db/human-work-items'
import type { Capability } from '@/lib/mission-control/capabilities'
import type { WorkItemWithSignal } from '@/lib/work-items/signals'

interface WorkItemsClientProps {
  orgId: string
  currentUserId: string
  agentIds?: string[]
  showHeader?: boolean
  title?: string
  description?: string
  initialSelectedId?: string | null
  gateCapability?: Capability | null
  detailHrefBase?: string | null
}

const FILTERS: Array<{ id: WorkItemsFilter; label: string }> = [
  { id: 'mine', label: 'My queue' },
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Closed' },
  { id: 'all', label: 'All' },
]

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500',
  high: 'bg-amber-500/15 text-amber-500',
  normal: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground/70',
}

interface DagContext {
  dag: {
    id: string
    status: string
    graph_version: number
    total_nodes: number
    completed_nodes: number
    failed_nodes: number
    ready_nodes: number
  }
  node: { id: string; node_key: string; node_type: string; status: string }
  children: Array<{
    id: string
    node_key: string
    node_type: string
    status: string
    edge_kind: string
  }>
  downstreamBlockedCount: number
}

/**
 * Compute an SLA chip from `due_at`. Returns null when there's no due date.
 * Buckets:
 *   - overdue  → red
 *   - < 1h     → amber
 *   - >= 1h    → emerald
 */
function computeSla(dueAt: string | null | undefined): {
  label: string
  tone: 'overdue' | 'soon' | 'ok'
} | null {
  if (!dueAt) return null
  const diffMs = new Date(dueAt).getTime() - Date.now()
  const absMs = Math.abs(diffMs)
  const mins = Math.floor(absMs / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  let label: string
  if (days >= 1) label = `${days}d ${hours % 24}h`
  else if (hours >= 1) label = `${hours}h ${mins % 60}m`
  else label = `${mins}m`

  if (diffMs < 0) return { label: `overdue ${label}`, tone: 'overdue' }
  if (diffMs < 60 * 60 * 1000) return { label: `due in ${label}`, tone: 'soon' }
  return { label: `due in ${label}`, tone: 'ok' }
}

const SLA_TONE: Record<'overdue' | 'soon' | 'ok', string> = {
  overdue: 'bg-red-500/15 text-red-500',
  soon: 'bg-amber-500/15 text-amber-500',
  ok: 'bg-emerald-500/15 text-emerald-500',
}

const NODE_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  ready: 'bg-blue-500/15 text-blue-500',
  running: 'bg-amber-500/15 text-amber-500',
  completed: 'bg-emerald-500/15 text-emerald-500',
  failed: 'bg-red-500/15 text-red-500',
  skipped: 'bg-muted text-muted-foreground/70',
}

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-500',
  in_progress: 'bg-amber-500/15 text-amber-500',
  waiting: 'bg-muted text-muted-foreground',
  done: 'bg-emerald-500/15 text-emerald-500',
  cancelled: 'bg-muted text-muted-foreground',
  rejected: 'bg-red-500/15 text-red-500',
}

export function WorkItemsClient(props: WorkItemsClientProps) {
  const {
    gateCapability = 'standard:work-items',
    ...rest
  } = props
  if (!gateCapability) {
    return <WorkItemsInner {...rest} />
  }
  return (
    <CapabilityGate
      capability={gateCapability}
      fallback={
        <div className="p-6">
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title="Work queue unavailable"
            description="Your plan does not include the human work queue."
          />
        </div>
      }
    >
      <WorkItemsInner {...rest} />
    </CapabilityGate>
  )
}

function WorkItemsInner({
  orgId,
  currentUserId,
  agentIds,
  showHeader = true,
  title = 'Work',
  description = 'Human work items: tickets, approvals, and handoffs.',
  initialSelectedId = null,
  detailHrefBase = null,
}: Omit<WorkItemsClientProps, 'gateCapability'>) {
  const [filter, setFilter] = useState<WorkItemsFilter>('mine')
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)

  // 60s ticker keeps SLA countdown chips fresh between polls.
  const [, setSlaTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSlaTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const { items, loading, error, refetch } = useWorkItems({ orgId, filter, agentIds })

  useEffect(() => {
    setSelectedId(initialSelectedId)
  }, [initialSelectedId])

  // Auto-select first item when the list loads or filter changes.
  useEffect(() => {
    if (!selectedId && items.length > 0) setSelectedId(items[0].id)
    if (selectedId && !items.find((i) => i.id === selectedId) && items.length > 0) {
      setSelectedId(items[0].id)
    }
  }, [items, selectedId])

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        {showHeader ? (
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {description}
            </p>
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs transition-colors',
                filter === f.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-500 border-b">{error}</div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-[360px] border-r overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-md bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-8 w-8" />}
              title="Nothing here"
              description={
                filter === 'mine'
                  ? 'No work items assigned to you.'
                  : 'No work items match this filter.'
              }
            />
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const isActive = item.id === selectedId
                const sla = computeSla(item.due_at)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors',
                        isActive && 'bg-accent/60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium truncate flex-1">
                          {item.title}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] rounded px-1.5 py-0.5 shrink-0',
                            PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.normal,
                          )}
                        >
                          {item.priority}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={cn(
                            'text-[10px] rounded px-1.5 py-0.5',
                            STATUS_COLOR[item.status] ?? STATUS_COLOR.open,
                          )}
                        >
                          {item.status.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                          {item.signal.label}
                        </span>
                        {item.kind === 'nerve_node' ? (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Workflow className="h-3 w-3" />
                            Workflow step
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Standalone
                          </span>
                        )}
                        {sla && (
                          <span
                            className={cn(
                              'text-[10px] rounded px-1.5 py-0.5 flex items-center gap-1',
                              SLA_TONE[sla.tone],
                            )}
                          >
                            <Clock className="h-3 w-3" />
                            {sla.label}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto">
          {selected ? (
            <WorkItemDetail
              key={selected.id}
              orgId={orgId}
              item={selected}
              currentUserId={currentUserId}
              onMutated={() => void refetch()}
              detailHref={detailHrefBase ? `${detailHrefBase}/${selected.id}` : null}
            />
          ) : (
            <EmptyState
              icon={<Inbox className="h-8 w-8" />}
              title="Select a work item"
              description="Choose an item from the list to view its details and activity."
            />
          )}
        </main>
      </div>
    </div>
  )
}

interface WorkItemDetailProps {
  orgId: string
  item: WorkItemWithSignal
  currentUserId: string
  onMutated: () => void
  detailHref?: string | null
}

function WorkItemDetail({ orgId, item, currentUserId, onMutated, detailHref }: WorkItemDetailProps) {
  const [events, setEvents] = useState<WorkItemEvent[]>([])
  const [dagContext, setDagContext] = useState<DagContext | null>(null)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [busy, setBusy] = useState<null | 'claim' | 'approve' | 'reject' | 'complete' | 'comment'>(
    null,
  )
  const [comment, setComment] = useState('')
  const [notes, setNotes] = useState('')

  const fetchDetail = useCallback(async () => {
    setLoadingEvents(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/work-items/${item.id}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setEvents([])
        setDagContext(null)
        return
      }
      const payload = (await res.json()) as {
        events: WorkItemEvent[]
        dagContext: DagContext | null
      }
      setEvents(payload.events ?? [])
      setDagContext(payload.dagContext ?? null)
    } catch {
      setEvents([])
      setDagContext(null)
    } finally {
      setLoadingEvents(false)
    }
  }, [orgId, item.id])

  useEffect(() => {
    void fetchDetail()
  }, [fetchDetail])

  const mutate = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      kind: NonNullable<typeof busy>,
    ) => {
      setBusy(kind)
      try {
        const csrf = getCSRFTokenFromCookie()
        const res = await fetch(`/api/orgs/${orgId}/work-items/${item.id}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        await fetchDetail()
        onMutated()
      } catch (err) {
        console.error('[work-items] mutation failed', err)
      } finally {
        setBusy(null)
      }
    },
    [orgId, item.id, fetchDetail, onMutated],
  )

  const handleClaim = () => void mutate('/claim', {}, 'claim')
  const handleResolve = (resolution: 'approved' | 'rejected' | 'completed') =>
    void mutate('/complete', { resolution, resolution_notes: notes || null }, resolution === 'approved' ? 'approve' : resolution === 'rejected' ? 'reject' : 'complete')
  const handleComment = async () => {
    if (!comment.trim()) return
    await mutate('/comment', { body: comment.trim() }, 'comment')
    setComment('')
  }

  const isClosed =
    item.status === 'done' || item.status === 'cancelled' || item.status === 'rejected'
  const isMine = item.assignee_user_id === currentUserId

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'text-[10px] rounded px-1.5 py-0.5',
                  STATUS_COLOR[item.status] ?? STATUS_COLOR.open,
                )}
              >
                {item.status.replace('_', ' ')}
              </span>
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                {item.signal.label}
              </span>
              <span
                className={cn(
                'text-[10px] rounded px-1.5 py-0.5',
                PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.normal,
              )}
            >
              {item.priority}
            </span>
            {item.kind === 'nerve_node' && (
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-blue-500/15 text-blue-500 flex items-center gap-1">
                <Workflow className="h-3 w-3" />
                Step {item.dag_node_id?.slice(0, 8)}
              </span>
            )}
            {(() => {
              const sla = computeSla(item.due_at)
              return sla ? (
                <span
                  className={cn(
                    'text-[10px] rounded px-1.5 py-0.5 flex items-center gap-1',
                    SLA_TONE[sla.tone],
                  )}
                >
                  <Clock className="h-3 w-3" />
                  {sla.label}
                </span>
              ) : null
            })()}
          </div>
          {detailHref ? (
            <Link href={detailHref} className="text-xs font-medium text-primary hover:underline">
              Open detail
            </Link>
          ) : null}
        </div>
        <h1 className="text-xl font-semibold">{item.title}</h1>
        {item.description && (
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
            {item.description}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <div>
            <dt className="inline font-medium">Assignee:</dt>{' '}
            <dd className="inline">
              {item.assignee_user_id
                ? isMine
                  ? 'You'
                  : item.assignee_user_id.slice(0, 8)
                : item.assignee_role ?? 'Unassigned'}
            </dd>
          </div>
          {item.due_at && (
            <div>
              <dt className="inline font-medium">Due:</dt>{' '}
              <dd className="inline">{new Date(item.due_at).toLocaleString()}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-medium">Created:</dt>{' '}
            <dd className="inline">{new Date(item.created_at).toLocaleString()}</dd>
          </div>
            {item.labels.length > 0 && (
              <div className="col-span-2">
                <dt className="inline font-medium">Labels:</dt>{' '}
                <dd className="inline">{item.labels.join(', ')}</dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="inline font-medium">Readiness:</dt>{' '}
              <dd className="inline">{item.signal.detail}</dd>
            </div>
          </dl>
        </div>

      {item.kind === 'nerve_node' && dagContext && (
        <DagContextPanel context={dagContext} />
      )}

        {!isClosed && (
          <div className="space-y-3 border-t pt-4">
            {!isMine && (
            <Button
              size="sm"
              onClick={handleClaim}
              disabled={busy !== null || !item.signal.readyForOperator}
            >
              {busy === 'claim' ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : null}
              Claim
            </Button>
          )}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Resolution notes (optional)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did you resolve this?"
              rows={3}
              disabled={busy !== null}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => handleResolve('approved')}
                disabled={busy !== null}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleResolve('completed')}
                disabled={busy !== null}
              >
                Mark done
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleResolve('rejected')}
                disabled={busy !== null}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">Activity</h3>
        {loadingEvents ? (
          <div className="h-16 rounded-md bg-muted/40 animate-pulse" />
        ) : events.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="text-xs flex items-start gap-3 border-l-2 border-border pl-3"
              >
                <span className="font-medium text-foreground min-w-[90px]">
                  {ev.event_type.replace('_', ' ')}
                </span>
                <span className="text-muted-foreground flex-1">
                  {describeEvent(ev)}
                </span>
                <span className="text-muted-foreground/60">
                  {new Date(ev.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="space-y-2 pt-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            disabled={busy !== null}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={handleComment}
              disabled={!comment.trim() || busy !== null}
            >
              {busy === 'comment' ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : null}
              Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DagContextPanel({ context }: { context: DagContext }) {
  const { dag, node, children, downstreamBlockedCount } = context
  return (
    <div className="space-y-3 border rounded-md p-4 bg-muted/20">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Workflow context</h3>
        <span
          className={cn(
            'text-[10px] rounded px-1.5 py-0.5',
            NODE_STATUS_COLOR[dag.status] ?? NODE_STATUS_COLOR.pending,
          )}
        >
          {dag.status}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          v{dag.graph_version}
        </span>
      </div>

      <dl className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
        <div>
          <dt className="font-medium">Total</dt>
          <dd>{dag.total_nodes}</dd>
        </div>
        <div>
          <dt className="font-medium">Done</dt>
          <dd className="text-emerald-500">{dag.completed_nodes}</dd>
        </div>
        <div>
          <dt className="font-medium">Ready</dt>
          <dd className="text-blue-500">{dag.ready_nodes}</dd>
        </div>
        <div>
          <dt className="font-medium">Failed</dt>
          <dd className="text-red-500">{dag.failed_nodes}</dd>
        </div>
      </dl>

      <div className="text-xs">
        <span className="font-medium text-foreground">This step:</span>{' '}
        <span className="text-muted-foreground">{node.node_key}</span>{' '}
        <span
          className={cn(
            'text-[10px] rounded px-1.5 py-0.5 ml-1',
            NODE_STATUS_COLOR[node.status] ?? NODE_STATUS_COLOR.pending,
          )}
        >
          {node.status}
        </span>
      </div>

      <div className="text-xs">
        {downstreamBlockedCount > 0 ? (
          <span className="text-amber-500 font-medium">
            Unblocks {downstreamBlockedCount} downstream step
            {downstreamBlockedCount === 1 ? '' : 's'}
          </span>
        ) : children.length > 0 ? (
          <span className="text-muted-foreground">
            {children.length} direct child{children.length === 1 ? '' : 'ren'} (none blocked)
          </span>
        ) : (
          <span className="text-muted-foreground">Leaf step — no downstream</span>
        )}
      </div>

      {children.length > 0 && (
        <ul className="space-y-1 pt-1 border-t">
          {children.map((child) => (
            <li
              key={child.id}
              className="text-xs flex items-center gap-2"
            >
              <span
                className={cn(
                  'text-[10px] rounded px-1.5 py-0.5 shrink-0',
                  NODE_STATUS_COLOR[child.status] ?? NODE_STATUS_COLOR.pending,
                )}
              >
                {child.status}
              </span>
              <span className="truncate flex-1 text-muted-foreground">
                {child.node_key}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {child.node_type} · {child.edge_kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function describeEvent(ev: WorkItemEvent): string {
  if (ev.event_type === 'commented') {
    const body = (ev.payload as { body?: string })?.body
    return body ?? '(no text)'
  }
  if (ev.event_type === 'resolved') {
    const { resolution, resolution_notes } = ev.payload as {
      resolution?: string
      resolution_notes?: string | null
    }
    return `${resolution ?? 'resolved'}${resolution_notes ? ` — ${resolution_notes}` : ''}`
  }
  if (ev.event_type === 'assigned') {
    const uid = (ev.payload as { assignee_user_id?: string })?.assignee_user_id
    return uid ? `to ${uid.slice(0, 8)}` : ''
  }
  return ''
}

