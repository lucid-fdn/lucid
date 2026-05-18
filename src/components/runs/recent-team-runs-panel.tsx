'use client'

import React, { useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import type { CrewRun } from '@contracts/crew'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RunSessionInspectorSheet } from '@/components/runs/run-session-inspector-sheet'
import { RunTimelineHeader } from '@/components/runs/run-timeline-header'
import { buildCrewRunsTimeline } from '@/lib/runs/timeline'

const RUN_STATUS_STYLES: Record<string, string> = {
  starting: 'bg-amber-500/15 text-amber-500',
  running: 'bg-blue-500/15 text-blue-500',
  completed: 'bg-emerald-500/15 text-emerald-500',
  failed: 'bg-red-500/15 text-red-500',
  cancelled: 'bg-muted text-muted-foreground',
}

export function RecentTeamRunsPanel({
  runs,
}: {
  runs: Array<CrewRun & { crewName?: string }>
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runs[0]?.id ?? null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const timeline = useMemo(() => buildCrewRunsTimeline(runs), [runs])
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No team runs yet. Single agents can still work independently, or you can create a team when coordination matters.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <RunTimelineHeader
        timeline={timeline}
        title="Execution overview"
        description="Use the timeline first to spot concurrency, failures, and long-running teams before reading the full receipt."
        selectedSegmentId={selectedRun?.id ?? null}
        onSegmentSelect={setSelectedRunId}
      />

      <div className="space-y-3">
        {runs.map((run) => (
          <div key={run.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{run.crewName}</p>
                <Badge className={RUN_STATUS_STYLES[run.status] ?? RUN_STATUS_STYLES.cancelled}>
                  {run.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Triggered via {run.trigger_type}
              </p>
              {run.outcome_summary ? (
                <p className="mt-2 text-xs text-muted-foreground">{run.outcome_summary}</p>
              ) : null}
              {run.error_message ? (
                <p className="mt-2 text-xs text-red-500">{run.error_message}</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-muted-foreground">
                {new Date(run.created_at).toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                ${Number(run.total_cost_usd ?? 0).toFixed(4)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 gap-1 text-xs"
                onClick={() => {
                  setSelectedRunId(run.id)
                  setInspectorOpen(true)
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                Inspect
              </Button>
            </div>
          </div>
        ))}
      </div>

      {selectedRun ? (
        <RunSessionInspectorSheet
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          title={selectedRun.crewName ?? 'Team run'}
          description="Execution context for this team run."
          badges={[selectedRun.status, selectedRun.trigger_type]}
          sections={[
            {
              id: 'started-at',
              label: 'Started at',
              value: new Date(selectedRun.started_at).toLocaleString(),
            },
            {
              id: 'completed-at',
              label: 'Completed at',
              value: selectedRun.completed_at ? new Date(selectedRun.completed_at).toLocaleString() : 'Still active',
            },
            {
              id: 'cost',
              label: 'Cost',
              value: `$${Number(selectedRun.total_cost_usd ?? 0).toFixed(4)}`,
            },
            {
              id: 'outcome',
              label: 'Outcome summary',
              value: selectedRun.outcome_summary ?? 'No outcome summary recorded.',
            },
            {
              id: 'error',
              label: 'Error',
              value: selectedRun.error_message ?? 'No error recorded.',
            },
          ]}
        />
      ) : null}
    </div>
  )
}
