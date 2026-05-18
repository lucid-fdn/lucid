/**
 * Feed event emitter — fire-and-forget inserts into mc_agent_events.
 *
 * Used by messaging.ts and subagent.ts to surface runtime primitive
 * events in the Mission Control live feed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AgentEventType =
  | 'agent_message_sent'
  | 'subagent_spawned'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'crew_run_started'
  | 'crew_run_completed'
  | 'crew_run_failed'
  | 'crew_member_started'
  | 'crew_member_completed'
  | 'crew_member_failed'
  | 'soul_updated'

export interface AgentFeedEvent {
  agentId: string
  orgId: string
  eventType: AgentEventType
  runId?: string
  payload: Record<string, unknown>
}

/**
 * Emit a feed event. Fire-and-forget — never blocks or throws.
 */
export function emitAgentFeedEvent(
  supabase: SupabaseClient,
  event: AgentFeedEvent,
): void {
  try {
    Promise.resolve(
      supabase
        .from('mc_agent_events')
        .insert({
          agent_id: event.agentId,
          org_id: event.orgId,
          event_type: event.eventType,
          run_id: event.runId ?? null,
          payload: event.payload,
        }),
    )
      .then(({ error }) => {
        if (error) {
          console.warn(`[feed-events] Failed to emit ${event.eventType}:`, error.message)
        }
      })
      .catch(() => {
        // Silently ignore — feed events are non-critical
      })
  } catch {
    // Silently ignore — feed events are non-critical
  }
}
