/**
 * DAG Advance Listener — Phase 6.
 *
 * Subscribes to `dag:advance` Supabase Broadcast channel. When a work
 * item's completion promotes DAG children on the control plane (webhook
 * route), this listener tells the scheduler to pick them up immediately
 * rather than waiting for the orphan-ready sweep.
 *
 * Fail-safe: if the broadcast is missed, the reconcile sweep in the
 * scheduler's `onDagResume` or the orphan-ready scan catches it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { IncrementalScheduler } from './scheduler.js'

let channel: ReturnType<SupabaseClient['channel']> | null = null
let subscriptionFallbackNoticeLogged = false

/** Debounce: collapse rapid-fire broadcasts for the same DAG. */
const pendingAdvances = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 500

export function startDagAdvanceListener(
  supabase: SupabaseClient,
  scheduler: IncrementalScheduler,
): void {
  if (channel) return // already started

  channel = supabase
    .channel('dag:advance')
    .on('broadcast', { event: 'nodes_promoted' }, (payload) => {
      const data = payload.payload as { dag_id?: string; node_ids?: string[] } | undefined
      if (!data?.dag_id) return

      const dagId = data.dag_id

      // Debounce: if we already have a pending advance for this DAG, reset
      // the timer so rapid bursts collapse into a single scheduler call.
      const existing = pendingAdvances.get(dagId)
      if (existing) clearTimeout(existing)

      pendingAdvances.set(
        dagId,
        setTimeout(async () => {
          pendingAdvances.delete(dagId)
          try {
            await scheduler.onExternalAdvance(dagId)
          } catch (err) {
            console.warn(
              '[dag-advance-listener] onExternalAdvance error:',
              err instanceof Error ? err.message : err,
            )
          }
        }, DEBOUNCE_MS),
      )
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        if (!subscriptionFallbackNoticeLogged) {
          subscriptionFallbackNoticeLogged = true
          console.info(
            '[dag-advance-listener] Realtime subscription unavailable; orphan sweep fallback remains active',
          )
        }
      }
    })
}

export function stopDagAdvanceListener(): void {
  // Clear any pending debounced advances.
  for (const timer of pendingAdvances.values()) clearTimeout(timer)
  pendingAdvances.clear()

  if (channel) {
    channel.unsubscribe()
    channel = null
  }
  subscriptionFallbackNoticeLogged = false
}
