/**
 * Pulse Inbound Enqueuer
 *
 * Dual path: push (on webhook/trigger) + sweep safety net (30s DB query).
 * Priority classification: cross-agent msgs → critical, standard → normal.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { PulseQueue } from '../queue.js'
import type { PulsePriority } from '../types.js'

/**
 * Push path: called from /trigger webhook when a new inbound event arrives.
 */
export async function enqueueInboundEvent(
  queue: PulseQueue,
  event: { id: string; assistant_id: string; org_id?: string; external_message_id?: string | null },
): Promise<boolean> {
  if (!event.org_id) return false

  const priority = classifyInboundPriority(event)
  return queue.enqueue({
    eventId: event.id,
    eventType: 'inbound',
    agentId: event.assistant_id,
    orgId: event.org_id,
    priority,
  })
}

/**
 * Sweep safety net: queries DB for pending events not yet in Redis.
 * Runs every 30s. Catches events from direct DB inserts, webhook failures, Redis downtime.
 * LIMIT 100, oldest first — next sweep catches the rest.
 */
export async function sweepPendingInboundEvents(
  queue: PulseQueue,
  supabase: SupabaseClient,
): Promise<number> {
  const { data: events, error } = await supabase
    .from('assistant_inbound_events')
    .select('id, assistant_id, org_id, external_message_id')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('next_attempt_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(100)

  if (error || !events || events.length === 0) return 0

  const assistantIds = Array.from(
    new Set(
      events
        .filter((event) => !event.org_id)
        .map((event) => event.assistant_id)
        .filter(Boolean),
    ),
  )
  const assistantOrgMap = new Map<string, string>()

  if (assistantIds.length > 0) {
    const { data: assistants, error: assistantsError } = await supabase
      .from('ai_assistants')
      .select('id, org_id')
      .in('id', assistantIds)

    if (assistantsError) {
      console.error('[pulse:sweep:inbound] Failed to resolve assistant orgs:', assistantsError)
      return 0
    }

    for (const assistant of assistants ?? []) {
      if (assistant?.id && assistant?.org_id) {
        assistantOrgMap.set(assistant.id as string, assistant.org_id as string)
      }
    }
  }

  let enqueued = 0
  for (const event of events) {
    const success = await enqueueInboundEvent(queue, {
      ...event,
      org_id: event.org_id ?? assistantOrgMap.get(event.assistant_id),
    })
    if (success) enqueued++
    // NX prevents dups — already-enqueued events are silently skipped
  }

  if (enqueued > 0) {
    console.log(`[pulse:sweep:inbound] Enqueued ${enqueued}/${events.length} pending events`)
  }

  return enqueued
}

function classifyInboundPriority(event: {
  external_message_id?: string | null
}): PulsePriority {
  // Cross-agent messages get critical priority
  if (event.external_message_id?.startsWith('agent-msg:')) return 'critical'
  return 'normal'
}
