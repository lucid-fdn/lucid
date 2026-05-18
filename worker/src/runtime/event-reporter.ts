/**
 * Event Reporter — Batches and sends feed events to the control plane.
 *
 * Collects events in a buffer and flushes every 5 seconds (or on demand).
 * Only active when IS_DEDICATED_RUNTIME=true (RestDataSink).
 */

import type { DataSink, FeedEvent } from './data-sink.js'
import type { ToolExecutionEvent } from '../agent/tool-runtime/types.js'
import type { EngineNativeMutationCandidate } from '../agent/contracts/mutation-policy.js'

const FLUSH_INTERVAL_MS = 5_000
const MAX_BATCH_SIZE = 100

let buffer: FeedEvent[] = []
let timer: ReturnType<typeof setInterval> | undefined
let sink: DataSink | null = null

export function initEventReporter(dataSink: DataSink): void {
  sink = dataSink
  timer = setInterval(flush, FLUSH_INTERVAL_MS)
  console.log(`[event-reporter] Started (flush every ${FLUSH_INTERVAL_MS / 1000}s)`)
}

export function reportEvent(event: FeedEvent): void {
  buffer.push(event)
  // Flush immediately if buffer is full
  if (buffer.length >= MAX_BATCH_SIZE) {
    flush()
  }
}

export function reportToolExecutionEvent(params: {
  agentId: string
  runId: string
  source: 'shared' | 'relay' | 'native'
  event: ToolExecutionEvent
}): void {
  const { agentId, runId, source, event } = params

  if (event.type === 'tool_failed') {
    reportEvent({
      agentId,
      eventType: 'error',
      severity: 'error',
      payload: {
        runId,
        source,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        toolEventType: event.type,
        ...event.payload,
      },
    })
    return
  }

  const eventType = event.type === 'tool_completed' ? 'tool_result' : 'tool_call'
  reportEvent({
    agentId,
    eventType,
    severity: event.type === 'tool_blocked_loop' || event.type === 'tool_denied' || event.type === 'tool_expired'
      ? 'warning'
      : 'info',
    payload: {
      runId,
      source,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      toolEventType: event.type,
      ...event.payload,
    },
  })
}

export function reportNativeMutationCandidateEvent(params: {
  agentId: string
  runId: string
  source: 'shared' | 'relay' | 'native'
  candidate: EngineNativeMutationCandidate
}): void {
  const { agentId, runId, source, candidate } = params

  reportEvent({
    agentId,
    eventType: 'native_mutation_candidate',
    severity: 'info',
    payload: {
      runId,
      source,
      toolName: candidate.toolName,
      toolEventType: 'native_mutation_candidate',
      mutationEngine: candidate.engine,
      mutationRuntimeFlavor: candidate.runtimeFlavor,
      mutationKind: candidate.kind,
      toolArgs: candidate.toolArgs,
      reason: candidate.reason,
    },
  })
}

export async function flush(): Promise<void> {
  if (!sink || buffer.length === 0) return

  const batch = buffer.splice(0, MAX_BATCH_SIZE)
  try {
    await sink.reportEvents(batch)
  } catch (err) {
    console.error('[event-reporter] Flush failed:', err instanceof Error ? err.message : err)
    // Put events back at the front of the buffer for retry
    buffer.unshift(...batch)
    // Cap buffer to prevent unbounded growth
    if (buffer.length > MAX_BATCH_SIZE * 5) {
      const dropped = buffer.length - MAX_BATCH_SIZE * 5
      buffer = buffer.slice(0, MAX_BATCH_SIZE * 5)
      console.warn(`[event-reporter] Dropped ${dropped} events (buffer overflow)`)
    }
  }
}

export function stopEventReporter(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
  // Final flush
  flush()
  console.log('[event-reporter] Stopped')
}
