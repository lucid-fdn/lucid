/**
 * Issue Detection Engine — Automatic anomaly flagging for runtime health.
 *
 * Pure function: takes runtime metrics, returns detected issues.
 * Inspired by robsannaa's dashboard issue detection but tailored
 * to LucidMerged's DedicatedRuntime data model.
 */

import type { DedicatedRuntime } from './types'
import { getConnectionStatus } from './types'

export type IssueSeverity = 'warning' | 'critical'

export interface RuntimeIssue {
  id: string
  severity: IssueSeverity
  title: string
  description: string
  metric?: string
  value?: number
  threshold?: number
}

// ─── Thresholds ──────────────────────────────────────────────────────────────

// Thresholds aligned with MetricBar/RadialGauge visual indicators:
// > 60% = amber (warning), > 80% = red (critical)
const THRESHOLDS = {
  cpu: { warning: 60, critical: 80 },
  ram: { warning: 60, critical: 80 },
  disk: { warning: 60, critical: 80 },
  gpu: { warning: 60, critical: 80 },
  pendingEvents: { warning: 100, critical: 500 },
  deadLetters: { warning: 1, critical: 10 },
} as const

// ─── Detector ────────────────────────────────────────────────────────────────

export function detectRuntimeIssues(runtime: DedicatedRuntime): RuntimeIssue[] {
  const issues: RuntimeIssue[] = []
  const status = getConnectionStatus(runtime.lastSeenAt)

  // Connection issues
  if (status === 'offline') {
    issues.push({
      id: `${runtime.id}-offline`,
      severity: 'critical',
      title: 'Runtime offline',
      description: 'No heartbeat received in over 5 minutes.',
    })
  } else if (status === 'stale') {
    issues.push({
      id: `${runtime.id}-stale`,
      severity: 'warning',
      title: 'Heartbeat stale',
      description: 'Last heartbeat was over 1 minute ago.',
    })
  }

  // Skip metric checks if offline (stale data)
  if (status === 'offline') return issues

  // CPU
  checkMetric(issues, runtime.id, 'cpu', 'CPU usage', runtime.cpuPercent, THRESHOLDS.cpu)

  // RAM
  checkMetric(issues, runtime.id, 'ram', 'Memory usage', runtime.ramPercent, THRESHOLDS.ram)

  // Disk
  checkMetric(issues, runtime.id, 'disk', 'Disk usage', runtime.diskPercent, THRESHOLDS.disk)

  // GPU
  if (runtime.gpuPercent != null) {
    checkMetric(issues, runtime.id, 'gpu', 'GPU usage', runtime.gpuPercent, THRESHOLDS.gpu)
  }

  // Queue depth
  if (runtime.workerPendingEvents >= THRESHOLDS.pendingEvents.critical) {
    issues.push({
      id: `${runtime.id}-queue-critical`,
      severity: 'critical',
      title: 'Event queue backlog',
      description: `${runtime.workerPendingEvents} events pending — worker may be stuck.`,
      metric: 'pendingEvents',
      value: runtime.workerPendingEvents,
      threshold: THRESHOLDS.pendingEvents.critical,
    })
  } else if (runtime.workerPendingEvents >= THRESHOLDS.pendingEvents.warning) {
    issues.push({
      id: `${runtime.id}-queue-warning`,
      severity: 'warning',
      title: 'Event queue growing',
      description: `${runtime.workerPendingEvents} events pending — processing may be slow.`,
      metric: 'pendingEvents',
      value: runtime.workerPendingEvents,
      threshold: THRESHOLDS.pendingEvents.warning,
    })
  }

  // Dead letters
  if (runtime.workerDeadLetters >= THRESHOLDS.deadLetters.critical) {
    issues.push({
      id: `${runtime.id}-deadletters-critical`,
      severity: 'critical',
      title: 'Dead letters accumulating',
      description: `${runtime.workerDeadLetters} permanently failed messages.`,
      metric: 'deadLetters',
      value: runtime.workerDeadLetters,
      threshold: THRESHOLDS.deadLetters.critical,
    })
  } else if (runtime.workerDeadLetters >= THRESHOLDS.deadLetters.warning) {
    issues.push({
      id: `${runtime.id}-deadletters`,
      severity: 'warning',
      title: 'Dead letters present',
      description: `${runtime.workerDeadLetters} failed message${runtime.workerDeadLetters > 1 ? 's' : ''}.`,
      metric: 'deadLetters',
      value: runtime.workerDeadLetters,
      threshold: THRESHOLDS.deadLetters.warning,
    })
  }

  // Native channel errors (C2a)
  if (runtime.nativeChannels) {
    const errorChannels = runtime.nativeChannels.filter((c) => c.status === 'error')
    if (errorChannels.length > 0) {
      issues.push({
        id: `${runtime.id}-channel-errors`,
        severity: 'warning',
        title: `${errorChannels.length} channel${errorChannels.length > 1 ? 's' : ''} in error`,
        description: errorChannels.map((c) => `${c.channelType}: ${c.errorMessage ?? 'unknown error'}`).join(', '),
      })
    }
  }

  return issues
}

/** Aggregate issues across all runtimes for a fleet summary */
export function detectFleetIssues(runtimes: DedicatedRuntime[]): RuntimeIssue[] {
  return runtimes.flatMap(detectRuntimeIssues)
}

/** Count issues by severity */
export function countIssues(issues: RuntimeIssue[]): { warnings: number; criticals: number } {
  let warnings = 0
  let criticals = 0
  for (const issue of issues) {
    if (issue.severity === 'critical') criticals++
    else warnings++
  }
  return { warnings, criticals }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function checkMetric(
  issues: RuntimeIssue[],
  runtimeId: string,
  metric: string,
  label: string,
  value: number | null,
  thresholds: { warning: number; critical: number },
) {
  if (value == null) return

  if (value >= thresholds.critical) {
    issues.push({
      id: `${runtimeId}-${metric}-critical`,
      severity: 'critical',
      title: `${label} critical`,
      description: `${label} at ${Math.round(value)}% (threshold: ${thresholds.critical}%).`,
      metric,
      value,
      threshold: thresholds.critical,
    })
  } else if (value >= thresholds.warning) {
    issues.push({
      id: `${runtimeId}-${metric}-warning`,
      severity: 'warning',
      title: `${label} elevated`,
      description: `${label} at ${Math.round(value)}% (threshold: ${thresholds.warning}%).`,
      metric,
      value,
      threshold: thresholds.warning,
    })
  }
}
