'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeedEventCard } from './feed-event'
import { ApprovalCard } from './approval-card'
import { FeedFilterBar, useFeedFilters } from './feed-filter-bar'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { getRunSummary } from '@/lib/expressions'
import type { FeedEvent, PendingApproval } from '@/lib/mission-control/types'

interface LiveFeedPaneProps {
  events: FeedEvent[]
  approvals?: PendingApproval[]
  onApprove?: (id: string) => void
  onDeny?: (id: string) => void
  /** Maximum events to display (default 200) */
  maxEvents?: number
  /** Show the header bar (default true) */
  showHeader?: boolean
  /** Show skeleton loading state */
  loading?: boolean
  /** Number of active channels (for empty state context) */
  channelCount?: number
  className?: string
}

export function LiveFeedPane({
  events,
  approvals = [],
  onApprove,
  onDeny,
  maxEvents = 200,
  showHeader = true,
  loading = false,
  channelCount = 0,
  className,
}: LiveFeedPaneProps) {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending')
  const bottomRef = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)

  // Event filtering
  const { filters, toggleGroup, toggleSeverity, clearAll, hasFilters, filterEvents } = useFeedFilters()

  const visibleEvents = useMemo(() => {
    const sliced = events.slice(-maxEvents)
    return filterEvents(sliced)
  }, [events, maxEvents, filterEvents])

  // Auto-scroll to bottom when new events arrive (unless user is hovering)
  useEffect(() => {
    if (!isHovering && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [visibleEvents.length, isHovering])

  // Group events by run_id for narrative
  const runGroups = groupEventsByRun(visibleEvents)

  return (
    <div className={className ?? 'flex-1 flex flex-col min-w-0 overflow-hidden'}>
      {showHeader && (
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Live Feed</h2>
          {events.length > 0 && (
            <span className="text-xs text-muted-foreground ml-0.5">
              {hasFilters ? `${visibleEvents.length}/${events.length}` : events.length}
            </span>
          )}
        </div>
      )}

      {/* Filter bar */}
      <FeedFilterBar
        filters={filters}
        onToggleGroup={toggleGroup}
        onToggleSeverity={toggleSeverity}
        onClearAll={clearAll}
        hasFilters={hasFilters}
        totalEvents={events.length}
        filteredEvents={visibleEvents.length}
      />

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="p-3 space-y-1.5">
          {/* Pinned: Pending approvals always on top */}
          {pendingApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={onApprove ?? (() => {})}
              onDeny={onDeny ?? (() => {})}
            />
          ))}

          {/* Feed events — grouped by run when possible */}
          {loading && visibleEvents.length === 0 && pendingApprovals.length === 0 ? (
            <FeedSkeleton />
          ) : visibleEvents.length === 0 && pendingApprovals.length === 0 ? (
            <ListeningEmptyState hasFilters={hasFilters} channelCount={channelCount} />
          ) : (
            runGroups.map((group) =>
              group.runId ? (
                <RunGroupCard key={group.runId} runId={group.runId} events={group.events} />
              ) : (
                group.events.map((event) => (
                  <FeedEventCard key={event.id} event={event} />
                ))
              )
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}

// ── Listening empty state ────────────────────────────────────────────

function ListeningEmptyState({ hasFilters, channelCount }: { hasFilters: boolean; channelCount: number }) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <p className="text-xs text-muted-foreground">No matching events</p>
        <p className="text-[10px] text-muted-foreground/60">Try adjusting or clearing your filters</p>
      </div>
    )
  }

  const statusLine = channelCount > 0
    ? `${channelCount} channel${channelCount > 1 ? 's' : ''} active · awaiting first event`
    : 'awaiting first event'

  return (
    <div className="flex flex-col items-center justify-center py-14 gap-4">
      <BreathingDot color="bg-zinc-500" animate size="sm" />
      <div className="text-center space-y-1.5">
        <p className="text-xs text-muted-foreground font-medium tracking-wide">Monitoring</p>
        <p className="text-[11px] text-muted-foreground/60">{statusLine}</p>
      </div>
    </div>
  )
}

// ── Skeleton ────────────────────────────────────────────────────────

function FeedSkeletonCard() {
  return (
    <div className="rounded-lg px-3 py-2">
      <div className="flex items-start gap-2.5">
        <div className="h-3.5 w-3.5 mt-0.5 rounded bg-muted animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-28 rounded bg-muted/70 animate-pulse" />
          </div>
          <div className="h-2.5 w-3/4 rounded bg-muted/50 animate-pulse" />
        </div>
        <div className="h-2.5 w-8 rounded bg-muted/50 animate-pulse flex-shrink-0" />
      </div>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <FeedSkeletonCard key={i} />
      ))}
    </div>
  )
}

/** Standalone skeleton for use in loading.tsx or Suspense boundaries */
export function LiveFeedPaneSkeleton({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {showHeader && (
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <div className="h-3.5 w-3.5 rounded bg-muted animate-pulse" />
          <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        </div>
      )}
      <div className="p-3 space-y-1.5 w-full">
        <FeedSkeleton />
      </div>
    </div>
  )
}

// ── Run grouping ─────────────────────────────────────────────────────

interface RunGroup {
  runId: string | null
  events: FeedEvent[]
}

function groupEventsByRun(events: FeedEvent[]): RunGroup[] {
  const groups: RunGroup[] = []
  let currentRunId: string | null | undefined

  for (const event of events) {
    const rid = event.run_id ?? null
    if (rid && rid === currentRunId && groups.length > 0) {
      groups[groups.length - 1].events.push(event)
    } else {
      groups.push({ runId: rid, events: [event] })
      currentRunId = rid
    }
  }
  return groups
}

function RunGroupCard({ runId, events }: { runId: string; events: FeedEvent[] }) {
  const [userToggled, setUserToggled] = useState(false)
  const [manualCollapsed, setManualCollapsed] = useState(true)
  const collapsed = userToggled ? manualCollapsed : events.length > 3
  const summary = getRunSummary(
    events.map((e) => ({ event_type: e.event_type, created_at: e.created_at, payload: e.payload as Record<string, unknown> | undefined })),
    runId,
  )

  const shown = collapsed ? events.slice(-2) : events

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden animate-state-enter">
      {/* Run header */}
      {summary && (
        <button
          type="button"
          onClick={() => { setUserToggled(true); setManualCollapsed(!collapsed) }}
          className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/60 hover:bg-muted transition-colors text-left"
        >
          <span className="text-[9px] text-muted-foreground/60 font-mono uppercase tracking-wider">run</span>
          <span className="text-[11px] text-muted-foreground flex-1">{summary}</span>
          {collapsed && events.length > 2 && (
            <span className="text-[10px] text-muted-foreground/60">
              +{events.length - 2} more
            </span>
          )}
        </button>
      )}
      <div className="space-y-0.5">
        {shown.map((event) => (
          <FeedEventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}
