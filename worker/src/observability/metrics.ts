/**
 * Lightweight operational counters for agent runtime features.
 *
 * Uses OTel Metrics API when OTEL_ENABLED=true, otherwise no-ops.
 * All counters are monotonic (Counter type) — dashboards derive rates.
 *
 * No PII in attributes — only categorical labels (status, outcome, channel type).
 */

import { metrics, type Counter, type Meter } from '@opentelemetry/api'

const SERVICE_NAME = 'lucid-worker'

let meter: Meter | null = null
let initialized = false

// Lazily resolve meter on first use (after SDK init)
function getMeter(): Meter {
  if (!meter) {
    meter = metrics.getMeter(SERVICE_NAME)
  }
  return meter
}

// ---- Scheduled Tasks --------------------------------------------------------

let schedulerClaimedCounter: Counter | null = null
let schedulerSucceededCounter: Counter | null = null
let schedulerFailedCounter: Counter | null = null
let schedulerDeadLetteredCounter: Counter | null = null

export function incSchedulerClaimed(count = 1): void {
  if (!schedulerClaimedCounter) {
    schedulerClaimedCounter = getMeter().createCounter('lucid.scheduler.tasks_claimed', {
      description: 'Scheduled tasks claimed by worker',
    })
  }
  schedulerClaimedCounter.add(count)
}

export function incSchedulerSucceeded(): void {
  if (!schedulerSucceededCounter) {
    schedulerSucceededCounter = getMeter().createCounter('lucid.scheduler.tasks_succeeded', {
      description: 'Scheduled tasks completed successfully',
    })
  }
  schedulerSucceededCounter.add(1)
}

export function incSchedulerFailed(): void {
  if (!schedulerFailedCounter) {
    schedulerFailedCounter = getMeter().createCounter('lucid.scheduler.tasks_failed', {
      description: 'Scheduled tasks that failed (will retry)',
    })
  }
  schedulerFailedCounter.add(1)
}

export function incSchedulerDeadLettered(): void {
  if (!schedulerDeadLetteredCounter) {
    schedulerDeadLetteredCounter = getMeter().createCounter('lucid.scheduler.tasks_dead_lettered', {
      description: 'Scheduled tasks that exhausted retries',
    })
  }
  schedulerDeadLetteredCounter.add(1)
}

// ---- Cross-Agent Messaging --------------------------------------------------

let msgEnqueuedCounter: Counter | null = null
let msgRejectedCounter: Counter | null = null

export function incMessagesEnqueued(): void {
  if (!msgEnqueuedCounter) {
    msgEnqueuedCounter = getMeter().createCounter('lucid.messaging.enqueued', {
      description: 'Cross-agent messages successfully enqueued',
    })
  }
  msgEnqueuedCounter.add(1)
}

export function incMessagesRejected(reason: 'cross_org' | 'not_found' | 'self_send' | 'rate_limit' | 'loop_guard' | 'too_long' | 'topology_blocked'): void {
  if (!msgRejectedCounter) {
    msgRejectedCounter = getMeter().createCounter('lucid.messaging.rejected', {
      description: 'Cross-agent messages rejected',
    })
  }
  msgRejectedCounter.add(1, { reason })
}

// ---- Subagents --------------------------------------------------------------

let subagentSpawnedCounter: Counter | null = null
let subagentFailedCounter: Counter | null = null

export function incSubagentSpawned(): void {
  if (!subagentSpawnedCounter) {
    subagentSpawnedCounter = getMeter().createCounter('lucid.subagent.spawned', {
      description: 'Subagents spawned',
    })
  }
  subagentSpawnedCounter.add(1)
}

export function incSubagentFailed(reason: 'error' | 'depth_limit' | 'children_limit' | 'aggregate_tool_limit' = 'error'): void {
  if (!subagentFailedCounter) {
    subagentFailedCounter = getMeter().createCounter('lucid.subagent.failed', {
      description: 'Subagent spawn failures',
    })
  }
  subagentFailedCounter.add(1, { reason })
}

// ---- Broadcast Wake (Phase 1) -----------------------------------------------

let wakeReceivedCounter: Counter | null = null
let pollingRescuedCounter: Counter | null = null
let wakeLatencyHistogram: import('@opentelemetry/api').Histogram | null = null

export function incBroadcastWakeReceived(): void {
  if (!wakeReceivedCounter) {
    wakeReceivedCounter = getMeter().createCounter('lucid.broadcast.wake_received', {
      description: 'Broadcast wake signals received',
    })
  }
  wakeReceivedCounter.add(1)
}

export function incBroadcastPollingRescued(): void {
  if (!pollingRescuedCounter) {
    pollingRescuedCounter = getMeter().createCounter('lucid.broadcast.polling_rescued', {
      description: 'Events discovered by fallback polling (broadcast missed)',
    })
  }
  pollingRescuedCounter.add(1)
}

export function recordBroadcastWakeLatency(ms: number): void {
  if (!wakeLatencyHistogram) {
    wakeLatencyHistogram = getMeter().createHistogram('lucid.broadcast.wake_latency_ms', {
      description: 'Latency from broadcast publish to worker wake (ms)',
      unit: 'ms',
    })
  }
  wakeLatencyHistogram.record(ms)
}

// ---- Pulse Queue ------------------------------------------------------------

let pulseEnqueuedCounter: Counter | null = null
let pulseClaimedCounter: Counter | null = null
let pulseCompletedCounter: Counter | null = null
let pulseFailedCounter: Counter | null = null
let pulseOrphanedCounter: Counter | null = null
let pulseOrphanedStepsCounter: Counter | null = null
let pulseDlqCounter: Counter | null = null
let pulseClaimLatencyHistogram: import('@opentelemetry/api').Histogram | null = null
let interactiveLatencyHistogram: import('@opentelemetry/api').Histogram | null = null
let interactiveBacklogHistogram: import('@opentelemetry/api').Histogram | null = null

export function incPulseEnqueued(eventType: string, priority: string): void {
  if (!pulseEnqueuedCounter) {
    pulseEnqueuedCounter = getMeter().createCounter('lucid.pulse.enqueued', {
      description: 'Jobs enqueued to Pulse queue',
    })
  }
  pulseEnqueuedCounter.add(1, { event_type: eventType, priority })
}

export function incPulseClaimed(eventType: string): void {
  if (!pulseClaimedCounter) {
    pulseClaimedCounter = getMeter().createCounter('lucid.pulse.claimed', {
      description: 'Jobs claimed from Pulse queue',
    })
  }
  pulseClaimedCounter.add(1, { event_type: eventType })
}

export function incPulseCompleted(eventType: string): void {
  if (!pulseCompletedCounter) {
    pulseCompletedCounter = getMeter().createCounter('lucid.pulse.completed', {
      description: 'Jobs completed successfully',
    })
  }
  pulseCompletedCounter.add(1, { event_type: eventType })
}

export function incPulseFailed(eventType: string, outcome: 'retried' | 'dlq'): void {
  if (!pulseFailedCounter) {
    pulseFailedCounter = getMeter().createCounter('lucid.pulse.failed', {
      description: 'Jobs that failed processing',
    })
  }
  pulseFailedCounter.add(1, { event_type: eventType, outcome })
}

export function incPulseOrphaned(): void {
  if (!pulseOrphanedCounter) {
    pulseOrphanedCounter = getMeter().createCounter('lucid.pulse.orphaned', {
      description: 'Orphaned runs detected (lease expired)',
    })
  }
  pulseOrphanedCounter.add(1)
}

export function incPulseOrphanedSteps(count = 1): void {
  if (!pulseOrphanedStepsCounter) {
    pulseOrphanedStepsCounter = getMeter().createCounter('lucid.pulse.orphaned_steps', {
      description: 'Stuck orchestration_steps recovered by orphan detector',
    })
  }
  if (count > 0) pulseOrphanedStepsCounter.add(count)
}

export function incPulseDlq(eventType: string): void {
  if (!pulseDlqCounter) {
    pulseDlqCounter = getMeter().createCounter('lucid.pulse.dlq', {
      description: 'Jobs sent to dead letter queue',
    })
  }
  pulseDlqCounter.add(1, { event_type: eventType })
}

export function recordPulseClaimLatency(ms: number, eventType: string): void {
  if (!pulseClaimLatencyHistogram) {
    pulseClaimLatencyHistogram = getMeter().createHistogram('lucid.pulse.claim_latency_ms', {
      description: 'Time from enqueue to claim (ms)',
      unit: 'ms',
    })
  }
  pulseClaimLatencyHistogram.record(ms, { event_type: eventType })
}

export function recordInteractiveLatency(ms: number, channelType: string, outcome: 'ok' | 'slow' | 'alert'): void {
  if (!interactiveLatencyHistogram) {
    interactiveLatencyHistogram = getMeter().createHistogram('lucid.interactive.latency_ms', {
      description: 'End-to-end interactive processing latency (ms)',
      unit: 'ms',
    })
  }
  interactiveLatencyHistogram.record(ms, { channel_type: channelType, outcome })
}

export function recordInteractiveBacklog(depth: number, eventType: 'inbound' | 'outbound'): void {
  if (!interactiveBacklogHistogram) {
    interactiveBacklogHistogram = getMeter().createHistogram('lucid.interactive.backlog_depth', {
      description: 'Observed interactive backlog depth snapshots',
    })
  }
  interactiveBacklogHistogram.record(depth, { event_type: eventType })
}
