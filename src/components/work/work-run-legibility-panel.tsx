'use client'

import React from 'react'
import { useMemo, useState } from 'react'
import type { FeedEvent } from '@/lib/mission-control/types'
import { RunNarrativeView } from '@/components/runs/run-narrative-view'
import { RunSessionInspectorSheet } from '@/components/runs/run-session-inspector-sheet'
import { RunTimelineHeader } from '@/components/runs/run-timeline-header'
import { buildFeedEventsTimeline } from '@/lib/runs/timeline'
import { feedEventsToNarrativeItems } from '@/lib/runs/receipts'

export function WorkRunLegibilityPanel({
  events,
}: {
  events: FeedEvent[]
}) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(events[0]?.id ?? null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const timeline = useMemo(() => buildFeedEventsTimeline(events), [events])
  const narrativeItems = useMemo(() => feedEventsToNarrativeItems(events), [events])
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null

  return (
    <>
      <div className="space-y-4">
        <RunTimelineHeader
          timeline={timeline}
          title="Linked run overview"
          description="See the linked execution path first, then inspect the full narrative."
          selectedSegmentId={selectedEvent?.id ?? null}
          onSegmentSelect={(segmentId) => {
            setSelectedEventId(segmentId)
            setInspectorOpen(true)
          }}
        />
        <RunNarrativeView
          items={narrativeItems}
          emptyTitle="No linked run events are available for this work item yet."
        />
      </div>

      {selectedEvent ? (
        <RunSessionInspectorSheet
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          title={String(selectedEvent.payload?.tool_name ?? selectedEvent.payload?.message_text ?? selectedEvent.event_type)}
          description="Linked run context for this work item."
          badges={[selectedEvent.severity, selectedEvent.agent_name]}
          sections={[
            {
              id: 'recorded-at',
              label: 'Recorded at',
              value: new Date(selectedEvent.created_at).toLocaleString(),
            },
            {
              id: 'agent',
              label: 'Agent',
              value: selectedEvent.agent_name,
            },
            {
              id: 'event-type',
              label: 'Event type',
              value: selectedEvent.event_type,
            },
            {
              id: 'payload',
              label: 'Payload',
              value: JSON.stringify(selectedEvent.payload, null, 2),
            },
          ]}
        />
      ) : null}
    </>
  )
}
