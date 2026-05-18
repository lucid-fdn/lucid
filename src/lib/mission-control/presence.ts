/**
 * Canonical presence state derivation — pure function.
 *
 * Single source of truth for event-driven presence, imported by both
 * useAgentPresence hook and canvas client.
 *
 * Rules (priority order — highest wins):
 *   responding   — message_sent event < 15s ago
 *   tool-calling — tool_call/native_mutation_candidate event < 15s ago
 *   thinking     — run_started event < 30s ago AND no tool_call in event list
 *   idle         — otherwise
 *
 * NOTE: This is intentionally different from useAgentPresence's internal
 * `deriveState()` which also factors in chat streaming status and React
 * lifecycle. This function operates purely on FeedEvent[] data — no hooks,
 * no component state — making it safe for both server and canvas contexts.
 */

import type { FeedEvent } from '@/lib/mission-control/types'
import type { AgentPresenceState } from '@/lib/mission-control/types'

// Priority: higher = wins
const STATE_PRIORITY: Record<AgentPresenceState, number> = {
  idle: 0,
  receiving: 1,
  thinking: 2,
  'tool-calling': 3,
  responding: 4,
}

export function derivePresenceState(events: FeedEvent[]): AgentPresenceState {
  const now = Date.now()
  let best: AgentPresenceState = 'idle'
  let hasToolCall = false

  // First pass: check for any tool execution/mutation event (regardless of age)
  for (const e of events) {
    if (e.event_type === 'tool_call' || e.event_type === 'native_mutation_candidate') {
      hasToolCall = true
      break
    }
  }

  // Second pass: find highest-priority matching state
  for (const e of events) {
    const age = now - new Date(e.created_at).getTime()

    if (e.event_type === 'message_sent' && age < 15_000) {
      if (STATE_PRIORITY['responding'] > STATE_PRIORITY[best]) best = 'responding'
    }
    if ((e.event_type === 'tool_call' || e.event_type === 'native_mutation_candidate') && age < 15_000) {
      if (STATE_PRIORITY['tool-calling'] > STATE_PRIORITY[best]) best = 'tool-calling'
    }
    if (e.event_type === 'run_started' && age < 30_000 && !hasToolCall) {
      if (STATE_PRIORITY['thinking'] > STATE_PRIORITY[best]) best = 'thinking'
    }
  }

  return best
}
