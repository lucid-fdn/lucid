'use client'

/**
 * useIntrospectionStream — Central hook for the Consciousness Stream.
 *
 * Subscribes to mc_introspection_events INSERT events via Supabase Realtime
 * filtered by agent_id. Builds a flat list of stream nodes grouped by run_id.
 * Ring buffer: max 200 nodes.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { RealtimePayload } from '@/hooks/use-supabase-realtime'
import type { IntrospectionKind, IntrospectionEvent, IntrospectionEmotion } from '@contracts/introspection'
import { deriveEmotion } from '@/components/introspection/emotion-engine'

export type { IntrospectionEmotion }

export interface StreamNode {
  id: string
  kind: IntrospectionKind
  runId: string
  data: Record<string, unknown>
  createdAt: string
  status: 'active' | 'complete' | 'error'
  durationMs?: number
  toolCallId?: string
  seq: number
}

export type StreamState = 'disabled' | 'waiting' | 'idle' | 'active'

export interface IntrospectionState {
  nodes: StreamNode[]
  isActive: boolean
  activeRunId: string | null
  emotion: IntrospectionEmotion
  streamState: StreamState
}

interface UseIntrospectionStreamOptions {
  orgId: string
  agentId: string
  enabled: boolean
}

const MAX_NODES = 200

const ERROR_KINDS = new Set(['tool_error'])
const COMPLETE_KINDS = new Set([
  'run_end', 'tool_result', 'tool_cache_hit', 'llm_end',
  'approval_resolved', 'subagent_complete',
])

function toStreamNode(event: IntrospectionEvent): StreamNode {
  const isError = ERROR_KINDS.has(event.kind)
  const isEnd = COMPLETE_KINDS.has(event.kind)

  return {
    id: event.id,
    kind: event.kind,
    runId: event.run_id,
    data: event.data,
    createdAt: event.created_at,
    status: isError ? 'error' : isEnd ? 'complete' : 'active',
    durationMs: (event.data.duration_ms as number) ?? undefined,
    toolCallId: event.tool_call_id,
    seq: event.seq ?? 0,
  }
}

/** Sort by createdAt primary (run ordering), seq secondary (within-run ordering) */
export function sortBySeq(a: StreamNode, b: StreamNode): number {
  const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  if (Math.abs(timeDiff) > 1000) return timeDiff // Different runs — use timestamp
  if (a.seq !== b.seq) return a.seq - b.seq // Same run window — use seq
  return timeDiff
}

export function useIntrospectionStream({
  orgId,
  agentId,
  enabled,
}: UseIntrospectionStreamOptions): IntrospectionState {
  const [nodes, setNodes] = useState<StreamNode[]>([])
  const nodesRef = useRef<StreamNode[]>([])

  // Use Realtime to listen for INSERT events on mc_introspection_events
  useRealtimeQuery<IntrospectionEvent[]>({
    queryFn: async () => {
      // No initial fetch — we only care about live events
      return []
    },
    realtimeConfig: {
      channelName: `introspection-${agentId}`,
      subscriptions: [
        {
          table: 'mc_introspection_events',
          events: ['INSERT'],
          filter: `agent_id=eq.${agentId}`,
        },
      ],
      orgId,
    },
    initialData: [],
    enabled,
    onRealtimeEvent: useCallback(
      (payload: RealtimePayload) => {
        const raw = payload.new as unknown as IntrospectionEvent
        if (!raw?.id || raw.agent_id !== agentId) return false

        const node = toStreamNode(raw)

        // Ring buffer: append, sort by seq, trim to MAX_NODES
        const updated = [...nodesRef.current, node].sort(sortBySeq).slice(-MAX_NODES)
        nodesRef.current = updated
        setNodes(updated)

        // Skip refetch — we handle the event directly
        return false
      },
      [agentId],
    ),
  })

  const isActive = useMemo(() => {
    if (nodes.length === 0) return false
    const last = nodes[nodes.length - 1]
    return last.kind !== 'run_end'
  }, [nodes])

  const activeRunId = useMemo(() => {
    if (!isActive || nodes.length === 0) return null
    return nodes[nodes.length - 1].runId
  }, [nodes, isActive])

  const emotion = useMemo(() => deriveEmotion(nodes, isActive), [nodes, isActive])

  const streamState: StreamState = useMemo(() => {
    if (!enabled) return 'disabled'
    if (isActive) return 'active'
    if (nodes.length > 0) return 'idle'
    return 'waiting'
  }, [enabled, isActive, nodes.length])

  return { nodes, isActive, activeRunId, emotion, streamState }
}
