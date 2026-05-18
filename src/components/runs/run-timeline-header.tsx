import React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatNarrativeDuration, formatNarrativeTime } from '@/lib/runs/narrative'
import type { RunTimelineModel, RunTimelineSegment } from '@/lib/runs/timeline'

export function RunTimelineHeader({
  timeline,
  title = 'Execution timeline',
  description,
  selectedSegmentId,
  onSegmentSelect,
}: {
  timeline: RunTimelineModel | null
  title?: string
  description?: string
  selectedSegmentId?: string | null
  onSegmentSelect?: (segmentId: string) => void
}) {
  if (!timeline || timeline.lanes.length === 0) {
    return null
  }

  const startedAtMs = new Date(timeline.startedAt).getTime()
  const endedAtMs = new Date(timeline.endedAt).getTime()
  const totalDurationMs = Math.max(endedAtMs - startedAtMs, 1)

  return (
    <div className="rounded-xl border bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {description ?? 'A compact view of how execution progressed before you read the full receipt.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="border-border text-muted-foreground">
            {timeline.lanes.length} lane{timeline.lanes.length === 1 ? '' : 's'}
          </Badge>
          <span>{formatNarrativeTime(timeline.startedAt)}</span>
          <span>→</span>
          <span>{formatNarrativeTime(timeline.endedAt)}</span>
          <span>{formatNarrativeDuration(totalDurationMs)}</span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {timeline.lanes.map((lane) => (
          <div key={lane.id} className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)] md:items-center">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{lane.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {lane.segments.length} segment{lane.segments.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="relative h-10 rounded-lg border border-border/60 bg-muted/20">
              {lane.segments.map((segment) => (
                <TimelineSegmentBar
                  key={segment.id}
                  segment={segment}
                  startedAtMs={startedAtMs}
                  totalDurationMs={totalDurationMs}
                  selected={selectedSegmentId === segment.id}
                  onSelect={onSegmentSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TimelineSegmentBar({
  segment,
  startedAtMs,
  totalDurationMs,
  selected,
  onSelect,
}: {
  segment: RunTimelineSegment
  startedAtMs: number
  totalDurationMs: number
  selected: boolean
  onSelect?: (segmentId: string) => void
}) {
  const segmentStartedAtMs = new Date(segment.startedAt).getTime()
  const segmentEndedAtMs = new Date(segment.endedAt).getTime()
  const left = ((segmentStartedAtMs - startedAtMs) / totalDurationMs) * 100
  const width = Math.max(((segmentEndedAtMs - segmentStartedAtMs) / totalDurationMs) * 100, 3)

  const content = (
    <div
      className={cn(
        'absolute top-1.5 flex h-7 items-center overflow-hidden rounded-md border px-2 text-[11px] transition-all',
        getSegmentToneClass(segment.tone),
        selected && 'ring-2 ring-primary/40',
      )}
      style={{ left: `${Math.max(left, 0)}%`, width: `${Math.min(width, 100)}%` }}
      title={segment.summary ?? segment.label}
    >
      <span className="truncate">{segment.label}</span>
    </div>
  )

  if (!onSelect) return content

  return (
    <button
      type="button"
      className="absolute inset-y-0"
      style={{ left: `${Math.max(left, 0)}%`, width: `${Math.min(width, 100)}%` }}
      onClick={() => onSelect(segment.id)}
      aria-label={`Select ${segment.label}`}
    >
      {content}
    </button>
  )
}

function getSegmentToneClass(tone: RunTimelineSegment['tone']) {
  if (tone === 'error') return 'border-red-500/20 bg-red-500/15 text-red-500'
  if (tone === 'warning') return 'border-amber-500/20 bg-amber-500/15 text-amber-500'
  if (tone === 'accent') return 'border-blue-500/20 bg-blue-500/15 text-blue-500'
  if (tone === 'success') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-500'
  return 'border-border bg-background text-foreground'
}
