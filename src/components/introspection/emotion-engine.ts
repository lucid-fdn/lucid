/**
 * Emotion Engine — Derives operational emotion from event patterns.
 *
 * Pure function, no hooks, no state. Called by useIntrospectionStream
 * on each event batch to determine the agent's current emotional state.
 */

import type { IntrospectionEmotion } from '@contracts/introspection'

export type { IntrospectionEmotion }

export interface StreamNodeLike {
  kind: string
  createdAt: string
  status: 'active' | 'complete' | 'error'
}

const STRAINED_WINDOW_MS = 30_000 // errors in last 30s → strained
const LEARNING_WINDOW_MS = 10_000 // memory ops in last 10s → learning

export function deriveEmotion(nodes: StreamNodeLike[], isActive: boolean): IntrospectionEmotion {
  if (!isActive || nodes.length === 0) return 'idle'

  const lastNode = nodes[nodes.length - 1]

  // Run just ended → idle
  if (lastNode.kind === 'run_end') return 'idle'

  const now = Date.now()

  // Check for errors in the last 30s → strained
  const hasRecentError = nodes.some(
    (n) =>
      n.kind === 'tool_error' &&
      now - new Date(n.createdAt).getTime() < STRAINED_WINDOW_MS,
  )
  if (hasRecentError) return 'strained'

  // Check for approval wait → cautious
  const hasPendingApproval = nodes.some(
    (n) => n.kind === 'approval_wait' && n.status === 'active',
  )
  if (hasPendingApproval) return 'cautious'

  // Check for memory operations in last 10s → learning
  const hasRecentMemory = nodes.some(
    (n) =>
      (n.kind === 'memory_extract' || n.kind === 'memory_load') &&
      now - new Date(n.createdAt).getTime() < LEARNING_WINDOW_MS,
  )
  if (hasRecentMemory) return 'learning'

  // Default active state
  return 'confident'
}
