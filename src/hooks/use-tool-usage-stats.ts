'use client'

/**
 * useToolUsageStats — Aggregates tool call/error/duration stats from StreamNode[].
 *
 * Pure derivation (useMemo). Used by ToolOrbit.
 */

import { useMemo } from 'react'
import type { StreamNode } from '@/hooks/use-introspection-stream'

export interface ToolUsageStat {
  toolName: string
  callCount: number
  errorCount: number
  avgDurationMs: number
  lastStatus: 'active' | 'complete' | 'error'
}

export function useToolUsageStats(nodes: StreamNode[]): ToolUsageStat[] {
  return useMemo(() => {
    const stats = new Map<string, {
      calls: number
      errors: number
      totalDuration: number
      durationCount: number
      lastStatus: 'active' | 'complete' | 'error'
    }>()

    for (const node of nodes) {
      if (node.kind !== 'tool_start' && node.kind !== 'tool_result' &&
          node.kind !== 'tool_error' && node.kind !== 'tool_cache_hit') {
        continue
      }

      const name = String(node.data.tool_name ?? 'unknown')
      let entry = stats.get(name)
      if (!entry) {
        entry = { calls: 0, errors: 0, totalDuration: 0, durationCount: 0, lastStatus: 'active' }
        stats.set(name, entry)
      }

      if (node.kind === 'tool_start' || node.kind === 'tool_cache_hit') {
        entry.calls++
      }
      if (node.kind === 'tool_error') {
        entry.errors++
        entry.lastStatus = 'error'
      }
      if (node.kind === 'tool_result') {
        entry.lastStatus = 'complete'
        if (node.durationMs) {
          entry.totalDuration += node.durationMs
          entry.durationCount++
        }
      }
    }

    return Array.from(stats.entries())
      .map(([toolName, s]) => ({
        toolName,
        callCount: s.calls,
        errorCount: s.errors,
        avgDurationMs: s.durationCount > 0 ? Math.round(s.totalDuration / s.durationCount) : 0,
        lastStatus: s.lastStatus,
      }))
      .sort((a, b) => b.callCount - a.callCount)
  }, [nodes])
}
