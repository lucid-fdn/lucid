'use client'

/**
 * useSmartAnnotations — Rules-based post-run insight cards.
 *
 * Pure derivation. Checks for anomalies (cost spikes, tool failures,
 * slow runs, repeated tool calls) and returns up to 3 annotations per run.
 */

import { useMemo, useRef } from 'react'
import type { RunSummary } from '@/hooks/use-run-history'
import type { StreamNode } from '@/hooks/use-introspection-stream'

export type AnnotationSeverity = 'info' | 'warn'

export interface Annotation {
  id: string
  runId: string
  severity: AnnotationSeverity
  message: string
}

export function computeAnnotations(
  runs: RunSummary[],
  nodes: StreamNode[],
): Annotation[] {
  if (runs.length === 0) return []

  const completedRuns = runs.filter((r) => !r.isActive)
  if (completedRuns.length === 0) return []

  const latestRun = completedRuns[completedRuns.length - 1]
  const annotations: Annotation[] = []

  // Rolling averages (exclude latest)
  const priorRuns = completedRuns.slice(0, -1)

  // Rule 1: Cost spike (> 3x rolling average)
  if (priorRuns.length >= 2) {
    const avgCost = priorRuns.reduce((s, r) => s + r.costUsd, 0) / priorRuns.length
    if (avgCost > 0 && latestRun.costUsd > avgCost * 3) {
      annotations.push({
        id: `cost-${latestRun.runId}`,
        runId: latestRun.runId,
        severity: 'warn',
        message: `This run cost $${latestRun.costUsd.toFixed(4)} \u2014 ${Math.round(latestRun.costUsd / avgCost)}x your average`,
      })
    }
  }

  // Rule 2: Tool failed > 2x in this run
  const runNodes = nodes.filter((n) => n.runId === latestRun.runId)
  const errorCounts = new Map<string, number>()
  for (const n of runNodes) {
    if (n.kind === 'tool_error') {
      const name = String(n.data.tool_name ?? 'unknown')
      errorCounts.set(name, (errorCounts.get(name) ?? 0) + 1)
    }
  }
  for (const [tool, count] of errorCounts) {
    if (count >= 2) {
      annotations.push({
        id: `errors-${latestRun.runId}-${tool}`,
        runId: latestRun.runId,
        severity: 'warn',
        message: `${tool} failed ${count} times \u2014 check API key`,
      })
    }
  }

  // Rule 3: Duration spike (> 3x average)
  if (priorRuns.length >= 2) {
    const avgDuration = priorRuns.reduce((s, r) => s + r.durationMs, 0) / priorRuns.length
    if (avgDuration > 0 && latestRun.durationMs > avgDuration * 3) {
      annotations.push({
        id: `slow-${latestRun.runId}`,
        runId: latestRun.runId,
        severity: 'info',
        message: `This run took ${(latestRun.durationMs / 1000).toFixed(1)}s \u2014 ${Math.round(latestRun.durationMs / avgDuration)}x typical`,
      })
    }
  }

  // Rule 4: Same tool called > 5x in one run
  const toolCounts = new Map<string, number>()
  for (const n of runNodes) {
    if (n.kind === 'tool_start') {
      const name = String(n.data.tool_name ?? 'unknown')
      toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1)
    }
  }
  for (const [tool, count] of toolCounts) {
    if (count > 5) {
      annotations.push({
        id: `repeat-${latestRun.runId}-${tool}`,
        runId: latestRun.runId,
        severity: 'info',
        message: `${tool} called ${count} times \u2014 consider caching`,
      })
    }
  }

  // Sort by severity (warn first), limit to 2
  annotations.sort((a, b) => {
    if (a.severity === 'warn' && b.severity !== 'warn') return -1
    if (a.severity !== 'warn' && b.severity === 'warn') return 1
    return 0
  })

  return annotations.slice(0, 2)
}

/** Fingerprint for dedup across runs — based on annotation type (id prefix) + severity */
export function fingerprint(ann: Annotation): string {
  // id format: "cost-{runId}", "errors-{runId}-{tool}", "slow-{runId}", "repeat-{runId}-{tool}"
  // Extract the type prefix and optional tool suffix for dedup
  const idParts = ann.id.split('-')
  const type = idParts[0] // cost, errors, slow, repeat
  // For tool-specific annotations, include the tool name (last part after runId)
  const tool = idParts.length > 2 ? idParts.slice(2).join('-') : ''
  return `${ann.severity}:${type}:${tool}`
}

export function useSmartAnnotations(
  runs: RunSummary[],
  nodes: StreamNode[],
): Annotation[] {
  // Session-scoped dedup: track fingerprints seen in recent runs
  const seenRef = useRef<Map<string, number>>(new Map())

  return useMemo(() => {
    const raw = computeAnnotations(runs, nodes)
    const currentRunCount = runs.filter((r) => !r.isActive).length

    // Filter out annotations seen within last 3 runs
    const deduped = raw.filter((ann) => {
      const fp = fingerprint(ann)
      const lastSeen = seenRef.current.get(fp)
      if (lastSeen != null && currentRunCount - lastSeen < 3) {
        return false
      }
      seenRef.current.set(fp, currentRunCount)
      return true
    })

    return deduped
  }, [runs, nodes])
}
