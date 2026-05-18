/**
 * Pulse Wake Signal — Fleet-wide cross-replica wake bus.
 *
 * Pulse workers use adaptive exponential backoff (100ms → 5s) when the
 * claim loop is idle. A single-process push enqueue can call
 * `worker.resetBackoff()` directly, but with multiple worker replicas
 * only the replica that received the webhook wakes up — peers sit out
 * the backoff until sweep (30s) or the next idle tick.
 *
 * This module bridges that gap by broadcasting a lightweight "wake" event
 * on a fleet-wide Supabase Realtime channel. Every replica subscribes on
 * startup and calls `resetBackoff()` on the relevant worker when it
 * hears a wake event. Payload is intentionally minimal — we don't ship
 * the job, just the wake signal. The Pulse queue is the source of truth.
 *
 * Correctness: this is a pure latency optimisation. If Realtime is down
 * or a message is dropped, the sweep safety net + adaptive backoff cap
 * (5s) still drain the queue. Never treat the wake as authoritative.
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { PulseEventType } from './types.js'

const CHANNEL_NAME = 'pulse.wake'
const EVENT_NAME = 'wake'

export interface PulseWakePayload {
  eventType: PulseEventType
  publishedAt: string
}

export interface PulseWakeHandlers {
  onInbound?: () => void
  onOutbound?: () => void
  onScheduled?: () => void
}

let channel: RealtimeChannel | null = null
let supabaseRef: SupabaseClient | null = null
let channelReady = false

/**
 * Subscribe to the fleet-wide Pulse wake channel.
 * Each replica calls this once on startPulseWorkers().
 * The same channel is reused for outbound publish — Realtime requires
 * the channel to be joined before send() is allowed.
 */
export function startPulseWake(
  supabase: SupabaseClient,
  handlers: PulseWakeHandlers,
): void {
  if (channel) return
  supabaseRef = supabase
  channelReady = false

  channel = supabase
    .channel(CHANNEL_NAME, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: EVENT_NAME }, (message) => {
      const payload = message.payload as PulseWakePayload | undefined
      if (!payload?.eventType) return
      switch (payload.eventType) {
        case 'inbound':
          handlers.onInbound?.()
          break
        case 'outbound':
          handlers.onOutbound?.()
          break
        case 'scheduled':
          handlers.onScheduled?.()
          break
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelReady = true
        console.log(`[pulse:wake] Subscribed to ${CHANNEL_NAME}`)
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        channelReady = false
      }
    })
}

/**
 * Unsubscribe from the Pulse wake channel (graceful shutdown).
 */
export function stopPulseWake(): void {
  if (channel && supabaseRef) {
    supabaseRef.removeChannel(channel).catch(() => {})
    channel = null
    supabaseRef = null
    channelReady = false
  }
}

/**
 * Publish a wake event to all Pulse replicas. Best-effort — if the
 * channel isn't ready yet, the call is a no-op and the sweep safety
 * net + local resetBackoff cover the gap.
 */
export function publishPulseWake(eventType: PulseEventType): void {
  if (!channel || !channelReady) return
  channel
    .send({
      type: 'broadcast',
      event: EVENT_NAME,
      payload: { eventType, publishedAt: new Date().toISOString() } as PulseWakePayload,
    })
    .catch(() => {
      // Sweep safety net covers missed wakes
    })
}
