'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/mission-control/empty-state'
import { RunNarrativeView } from '@/components/runs/run-narrative-view'
import { replayStepsToNarrativeItems, type ReplayRunStep } from '@/lib/runs/receipts'
import { RunTimelineHeader } from '@/components/runs/run-timeline-header'
import { RunSessionInspectorSheet } from '@/components/runs/run-session-inspector-sheet'
import { buildReplayTimeline } from '@/lib/runs/timeline'
import { AlertTriangle, ArrowLeft, Clock, DollarSign, Eye } from 'lucide-react'

interface ReplayDetailClientProps {
  orgId: string
  workspaceSlug: string
  conversationId: string
}

export function ReplayDetailClient({
  orgId,
  workspaceSlug,
  conversationId,
}: ReplayDetailClientProps) {
  const router = useRouter()
  const [steps, setSteps] = useState<ReplayRunStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRun() {
      setLoading(true)
      try {
        const res = await fetch(`/api/mission-control/replay/${conversationId}?org_id=${orgId}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to fetch run')
        }
        const data = await res.json()
        const events = Array.isArray(data) ? data : data.events ?? []
        setSteps(events)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    void fetchRun()
  }, [conversationId, orgId])

  const totalTokens = steps.reduce((sum, step) => sum + (step.tokens_used ?? 0), 0)
  const totalCost = steps.reduce((sum, step) => sum + (step.cost_usd ?? 0), 0)
  const errorCount = steps.filter((step) => step.status === 'failed' || step.status === 'error').length
  const narrativeItems = useMemo(() => replayStepsToNarrativeItems(steps), [steps])
  const timeline = useMemo(() => buildReplayTimeline(steps), [steps])
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const selectedStep = steps.find((step) => step.id === selectedStepId) ?? steps[0] ?? null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to replay list"
          onClick={() => router.push(`/${workspaceSlug}/mission-control/replay`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Run: {conversationId.slice(0, 12)}...</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Workspace replay for cross-project diagnosis. Change agent behavior from the project page after you identify the issue.
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{steps.length} steps</span>
            {totalTokens > 0 ? (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {totalTokens.toLocaleString()} tokens
              </span>
            ) : null}
            {totalCost > 0 ? (
              <span className="flex items-center gap-0.5">
                <DollarSign className="h-3 w-3" />
                ${totalCost.toFixed(4)}
              </span>
            ) : null}
            {errorCount > 0 ? (
              <span className="flex items-center gap-0.5 text-red-500">
                <AlertTriangle className="h-3 w-3" />
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
        </div>
        {steps.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => {
              setSelectedStepId((current) => current ?? steps[0]?.id ?? null)
              setInspectorOpen(true)
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            Inspect
          </Button>
        ) : null}
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title={error} />
        ) : narrativeItems.length === 0 ? (
          <EmptyState title="No steps found for this run" />
        ) : (
          <div className="p-3">
            <RunTimelineHeader
              timeline={timeline}
              title="Execution overview"
              description="See how the replay unfolded before diving into the transcript."
              selectedSegmentId={selectedStep?.id ?? null}
              onSegmentSelect={setSelectedStepId}
            />
            <div className="mt-4">
            <RunNarrativeView items={narrativeItems} />
            </div>
          </div>
        )}
      </ScrollArea>

      {selectedStep ? (
        <RunSessionInspectorSheet
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          title={String(selectedStep.payload?.tool_name ?? selectedStep.payload?.message_text ?? selectedStep.event_type)}
          description="Replay step context for this session."
          badges={[selectedStep.status, selectedStep.channel_type]}
          sections={[
            {
              id: 'started-at',
              label: 'Recorded at',
              value: new Date(selectedStep.created_at).toLocaleString(),
            },
            {
              id: 'direction',
              label: 'Direction',
              value: selectedStep.direction,
            },
            {
              id: 'cost',
              label: 'Cost / tokens',
              value: `${selectedStep.tokens_used ?? 0} tokens · $${Number(selectedStep.cost_usd ?? 0).toFixed(4)}`,
            },
            {
              id: 'error',
              label: 'Error',
              value: selectedStep.error_message ?? 'No error recorded.',
            },
            {
              id: 'payload',
              label: 'Payload',
              value: JSON.stringify(selectedStep.payload, null, 2),
            },
          ]}
        />
      ) : null}
    </div>
  )
}
