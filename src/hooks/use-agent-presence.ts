'use client'

/**
 * Agent Presence Hook
 *
 * Derives agent "aliveness" signals from activity events and chat status:
 * - Current state (idle / receiving / thinking / tool-calling / responding)
 * - Last activity timestamp + human-readable relative time
 * - Activity sparkline data (event counts per bucket)
 * - Connection health
 *
 * Types centralized in lib/mission-control/types.ts.
 * State config centralized in lib/mission-control/constants.ts.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { FeedEvent } from '@/lib/mission-control/types'
import type { AgentPresenceState, AgentPresence, ChatStatus } from '@/lib/mission-control/types'

// Re-export for convenience
export type { AgentPresenceState, AgentPresence, ChatStatus }

const SPARKLINE_BUCKETS = 7
const BUCKET_SIZE_MS = 30_000 // 30s per bucket

/** Compute relative time label using date-fns */
function formatRelativeTime(date: Date | null): string {
  if (!date) return 'No activity'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 5_000) return 'Just now'
  return formatDistanceToNow(date, { addSuffix: true })
}

/** Derive agent state from chat status + recent events */
function deriveState(
  chatStatus: ChatStatus | undefined,
  recentEvents: FeedEvent[],
): AgentPresenceState {
  // Chat status takes priority (real-time from useChat)
  if (chatStatus === 'submitted') return 'thinking'
  if (chatStatus === 'streaming') return 'responding'

  // Fallback: infer from recent events (last 10s)
  const cutoff = Date.now() - 10_000
  const recent = recentEvents.filter(
    (e) => new Date(e.created_at).getTime() > cutoff,
  )

  if (recent.length === 0) return 'idle'

  // Check event types in priority order (newest first)
  for (const e of recent.reverse()) {
    if (e.event_type === 'tool_call' || e.event_type === 'native_mutation_candidate') return 'tool-calling'
    if (e.event_type === 'message_sent') return 'responding'
    if (e.event_type === 'message_received') return 'receiving'
    if (e.event_type === 'run_started') return 'thinking'
  }

  return 'idle'
}

/** Build sparkline buckets from events (7 × 30s buckets, oldest → newest) */
export function buildSparkline(events: FeedEvent[]): number[] {
  const now = Date.now()
  const buckets = new Array(SPARKLINE_BUCKETS).fill(0) as number[]

  for (const e of events) {
    const age = now - new Date(e.created_at).getTime()
    const bucketIdx = SPARKLINE_BUCKETS - 1 - Math.floor(age / BUCKET_SIZE_MS)
    if (bucketIdx >= 0 && bucketIdx < SPARKLINE_BUCKETS) {
      buckets[bucketIdx]++
    }
  }

  return buckets
}

export function useAgentPresence(
  events: FeedEvent[],
  chatStatus?: ChatStatus,
  connected = true,
): AgentPresence {
  const [tick, setTick] = useState(0)
  const tickRef = useRef(0)

  // Tick every 5s to update relative timestamps
  useEffect(() => {
    const timer = setInterval(() => {
      tickRef.current++
      setTick(tickRef.current)
    }, 5_000)
    return () => clearInterval(timer)
  }, [])

  const state = useMemo(
    () => deriveState(chatStatus, events),
    [chatStatus, events],
  )

  const lastActivityAt = useMemo(() => {
    if (events.length === 0) return null
    const sorted = [...events].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    return new Date(sorted[0].created_at)
  }, [events])

  const lastActivityLabel = useMemo(
    () => formatRelativeTime(lastActivityAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastActivityAt, tick],
  )

  const sparklineData = useMemo(
    () => buildSparkline(events),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, tick],
  )

  return { state, lastActivityAt, lastActivityLabel, sparklineData, connected }
}
