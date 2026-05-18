/**
 * Pulse Outbound Enqueuer
 *
 * Dual path: push (on outbound event insert) + sweep safety net.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { PulseQueue } from '../queue.js'

let registeredQueue: PulseQueue | null = null
let registeredWake: (() => void) | null = null

export function registerOutboundDispatcher(
  queue: PulseQueue | null,
  wake?: (() => void) | null,
): void {
  registeredQueue = queue
  registeredWake = wake ?? null
}

/**
 * Push path: called when outbound events are inserted.
 */
export async function enqueueOutboundEvent(
  queue: PulseQueue,
  event: { id: string; channel_id: string; org_id?: string },
  orgId: string,
): Promise<boolean> {
  return queue.enqueue({
    eventId: event.id,
    eventType: 'outbound',
    agentId: event.channel_id, // channel_id used as agent proxy for outbound
    orgId,
    priority: 'normal',
  })
}

export async function enqueueOutboundEventImmediately(
  event: { id: string; channel_id: string; org_id?: string | null },
): Promise<boolean> {
  if (!registeredQueue || !event.org_id) return false

  const enqueued = await enqueueOutboundEvent(
    registeredQueue,
    {
      id: event.id,
      channel_id: event.channel_id,
      org_id: event.org_id ?? undefined,
    },
    event.org_id,
  )

  if (enqueued) {
    registeredWake?.()
  }

  return enqueued
}

/**
 * Sweep safety net for outbound events.
 */
export async function sweepPendingOutboundEvents(
  queue: PulseQueue,
  supabase: SupabaseClient,
): Promise<number> {
  const { data: events, error } = await supabase
    .from('assistant_outbound_events')
    .select('id, channel_id')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('next_attempt_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(100)

  if (error || !events || events.length === 0) return 0

  let enqueued = 0
  for (const event of events) {
    // We need org_id for outbound — fetch from channel
    const success = await queue.enqueue({
      eventId: event.id,
      eventType: 'outbound',
      agentId: event.channel_id,
      orgId: 'sweep', // Outbound table has no org_id column — org context resolved from DB on claim. Safe: orgId is only used for re-enqueue metadata, not for Redis keys or DB lookups.
      priority: 'normal',
    })
    if (success) enqueued++
  }

  if (enqueued > 0) {
    console.log(`[pulse:sweep:outbound] Enqueued ${enqueued}/${events.length} pending events`)
  }

  return enqueued
}
