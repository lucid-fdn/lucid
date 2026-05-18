'use client'

import React from 'react'
import type { CrewRun } from '@contracts/crew'
import { RunTimelineHeader } from '@/components/runs/run-timeline-header'
import { RunSessionInspectorSheet } from '@/components/runs/run-session-inspector-sheet'
import { buildCrewRunsTimeline } from '@/lib/runs/timeline'

export function ProjectRunsLegibility({
  runs,
}: {
  runs: Array<CrewRun & { crewName?: string }>
}) {
  const timeline = React.useMemo(() => buildCrewRunsTimeline(runs), [runs])
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)

  const selectedRun = React.useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  )

  if (!timeline) return null

  return (
    <>
      <RunTimelineHeader
        timeline={timeline}
        title="Team execution timeline"
        description="See where recent team runs succeeded, failed, or paused before reading the full receipts below."
        selectedSegmentId={selectedRunId}
        onSegmentSelect={(segmentId) => {
          setSelectedRunId(segmentId)
          setInspectorOpen(true)
        }}
      />

      {selectedRun ? (
        <RunSessionInspectorSheet
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          title={selectedRun.crewName ?? 'Team run'}
          description="Project-level team run inspector."
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
              value: selectedRun.completed_at ? new Date(selectedRun.completed_at).toLocaleString() : 'Still running',
            },
            {
              id: 'cost',
              label: 'Cost',
              value: `$${Number(selectedRun.total_cost_usd ?? 0).toFixed(4)}`,
            },
            {
              id: 'outcome',
              label: 'Outcome',
              value: selectedRun.outcome_summary ?? 'No summary recorded.',
            },
            {
              id: 'error',
              label: 'Error',
              value: selectedRun.error_message ?? 'No error recorded.',
            },
          ]}
        />
      ) : null}
    </>
  )
}
