'use client'

/**
 * useRunHistory — Derives RunSummary[] from StreamNode[].
 *
 * Groups nodes by runId, computes per-run stats (duration, cost, tool count,
 * emotion). Used by RunTimelineBar.
 */

import { useMemo } from 'react'
import type { StreamNode } from '@/hooks/use-introspection-stream'
import type { IntrospectionEmotion } from '@contracts/introspection'

export interface RunSummary {
  runId: string
  startedAt: string
  endedAt: string | null
  durationMs: number
  toolCount: number
  totalTokens: number
  costUsd: number
  emotion: IntrospectionEmotion
  isActive: boolean
  nodeCount: number
}

export function useRunHistory(nodes: StreamNode[]): RunSummary[] {
  return useMemo(() => {
    const runMap = new Map<string, StreamNode[]>()

    for (const node of nodes) {
      let list = runMap.get(node.runId)
      if (!list) {
        list = []
        runMap.set(node.runId, list)
      }
      list.push(node)
    }

    const summaries: RunSummary[] = []

    for (const [runId, runNodes] of runMap) {
      const first = runNodes[0]
      const last = runNodes[runNodes.length - 1]
      const endNode = runNodes.find((n) => n.kind === 'run_end')
      const hasError = runNodes.some((n) => n.kind === 'tool_error')
      const hasApproval = runNodes.some((n) => n.kind === 'approval_wait' && n.status === 'active')

      const toolCount = runNodes.filter(
        (n) => n.kind === 'tool_start' || n.kind === 'tool_cache_hit',
      ).length

      const totalTokens = endNode?.data.total_tokens as number ?? 0
      const costUsd = endNode?.data.cost_usd as number ?? 0
      const durationMs = endNode?.durationMs ??
        (new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime())

      let emotion: IntrospectionEmotion = 'confident'
      if (hasError) emotion = 'strained'
      else if (hasApproval) emotion = 'cautious'

      summaries.push({
        runId,
        startedAt: first.createdAt,
        endedAt: endNode ? last.createdAt : null,
        durationMs,
        toolCount,
        totalTokens,
        costUsd,
        emotion,
        isActive: !endNode,
        nodeCount: runNodes.length,
      })
    }

    return summaries
  }, [nodes])
}
