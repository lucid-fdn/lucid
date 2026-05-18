/**
 * Pulse Orphan Detector
 *
 * 60s cron: SMEMBERS pulse:active → pipeline EXISTS for all lease keys.
 * Missing = orphaned → re-enqueue with attempt + 1.
 * Also verifies agent inflight counters.
 *
 * Lock-protected via SET NX EX (same as runtime-drain.ts).
 */

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPulseRedis } from './redis.js'
import { PulseQueue } from './queue.js'
import { type PulseLeaseInfo, PulseKeys } from './types.js'
import { PLAIN_CONDITIONAL_DEL_LUA, RESET_INFLIGHT_LUA } from './lua-scripts.js'
import { incPulseOrphaned, incPulseOrphanedSteps } from '../observability/metrics.js'
import { withSpan } from '../observability/tracing.js'

export class OrphanDetector {
  private queue: PulseQueue
  private supabase: SupabaseClient | null
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(queue: PulseQueue, supabase?: SupabaseClient) {
    this.queue = queue
    this.supabase = supabase ?? null
  }

  start(intervalMs: number): void {
    if (this.timer) return
    this.timer = setInterval(() => this.detect(), intervalMs)
    // Run immediately on start
    this.detect()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async detect(): Promise<{ orphansFound: number; counterResets: number }> {
    if (this.running) return { orphansFound: 0, counterResets: 0 }
    this.running = true

    try {
      const redis = await getPulseRedis()
      if (!redis) return { orphansFound: 0, counterResets: 0 }

      // Acquire orphan detector lock (30s TTL — must exceed worst-case DB recovery time).
      // UUID avoids PID reuse across containers.
      const lockValue = `detector-${randomUUID()}`
      const lockResult = await redis.set(
        PulseKeys.orphanLock(),
        lockValue,
        { nx: true, ex: 30 },
      )
      if (lockResult !== 'OK') return { orphansFound: 0, counterResets: 0 }

      try {
        return await withSpan('pulse.orphan_detect', {}, async () => {
        // 1. Get all active run IDs.
        // NOTE: an empty Redis active set does NOT short-circuit the whole pass —
        // DB-level recovery (stuck events, scheduled tasks, orchestration_steps)
        // must still run, since stuck rows can outlive Redis state entirely.
        const activeRunIds = await redis.smembers(PulseKeys.active()) as string[]

        // 2. Pipeline EXISTS for all lease keys (1 HTTP round-trip).
        // Skip the pipeline entirely when there are no active runs to avoid
        // an empty Upstash pipeline call.
        let leaseResults: unknown[] = []
        if (activeRunIds.length > 0) {
          const p = redis.pipeline()
          for (const runId of activeRunIds) {
            p.get(PulseKeys.lease(runId))
          }
          leaseResults = await p.exec()
        }

        // 3. Find orphans (in active set but lease expired)
        let orphansFound = 0
        const agentOrphans = new Map<string, number>() // agentId → count of orphans

        for (let i = 0; i < activeRunIds.length; i++) {
          const runId = activeRunIds[i]
          const leaseRaw = leaseResults[i] as string | null

          if (leaseRaw) {
            // Lease exists — not orphaned
            continue
          }

          // Lease expired — this run is orphaned
          orphansFound++

          // Remove from active set
          await redis.srem(PulseKeys.active(), runId)
          incPulseOrphaned()

          console.warn(`[pulse:orphan] Detected orphaned run ${runId} — lease expired, removed from active set`)

          try {
            const metricsKey = PulseKeys.metrics()
            await redis.hincrby(metricsKey, 'orphaned', 1)
          } catch {
            // Metrics are best-effort
          }
        }

        // 4. Verify inflight counters for agents with active runs
        // Build a map of agentId → count of active runs
        const agentActiveCounts = new Map<string, number>()
        for (let i = 0; i < activeRunIds.length; i++) {
          const leaseRaw = leaseResults[i] as string | null
          if (!leaseRaw) continue
          try {
            const info: PulseLeaseInfo = JSON.parse(leaseRaw)
            agentActiveCounts.set(
              info.agentId,
              (agentActiveCounts.get(info.agentId) || 0) + 1,
            )
          } catch {
            // Skip malformed
          }
        }

        // Check for agents with inflight > 0 but no active runs
        let counterResets = 0
        // We only check agents we know about from the active set
        // A more thorough check would SCAN pulse:agent:*:inflight but that's expensive
        for (const [agentId, activeCount] of agentActiveCounts) {
          const inflightKey = PulseKeys.agentInflight(agentId)
          // Atomic compare-and-set: only reset if current > expected, preventing
          // race with concurrent INCR from the claim loop's postClaimFlow
          const resetResult = await redis.eval(
            RESET_INFLIGHT_LUA,
            [inflightKey],
            [String(activeCount)],
          ) as number
          if (resetResult === 1) {
            counterResets++
            console.warn(
              `[pulse:orphan] Reset inflight counter for agent ${agentId} → ${activeCount}`,
            )
          }
        }

        // 5. Reset stuck DB events (claimed for longer than 2x lease TTL)
        // This ensures orphaned events go back to 'pending' so the sweep safety net re-enqueues them
        if (this.supabase) {
          try {
            const stuckThreshold = new Date(Date.now() - 120_000).toISOString() // 2 min ago
            for (const table of ['assistant_inbound_events', 'assistant_outbound_events'] as const) {
              await this.supabase
                .from(table)
                .update({ status: 'pending', locked_by: null, locked_at: null, locked_until: null })
                .eq('status', 'processing')
                .lt('locked_at', stuckThreshold)
            }
            // Also reset stuck scheduled tasks (claimed by pulse-scanner but never completed)
            await this.supabase
              .from('agent_scheduled_tasks')
              .update({ status: 'pending', claimed_by: null, claimed_at: null })
              .eq('status', 'claimed')
              .lt('claimed_at', stuckThreshold)

            // Phase 4N-0: recover stuck orchestration_steps. Steps in 'claimed' state
            // older than the stuck threshold are bumped back to 'pending' with attempt+1
            // so the parent event sweep / DAG planner can re-materialize them.
            // We SELECT first (to read current attempt) then UPDATE per row, since
            // supabase-js has no native column-arithmetic for batch updates.
            try {
              const { data: stuck, error: selErr } = await this.supabase
                .from('orchestration_steps')
                .select('id, run_id, event_id, agent_id, org_id, dag_node_id, attempt')
                .eq('status', 'claimed')
                .lt('started_at', stuckThreshold)
              if (selErr) {
                console.warn('[pulse:orphan] Failed to scan stuck steps:', selErr.message)
              } else if (stuck && stuck.length > 0) {
                for (const row of stuck) {
                  const { error: updErr } = await this.supabase
                    .from('orchestration_steps')
                    .update({
                      status: 'pending',
                      attempt: (row.attempt ?? 0) + 1,
                      error_message: 'orphaned-by-detector',
                    })
                    .eq('id', row.id)
                    .eq('status', 'claimed')
                  if (updErr) {
                    console.warn(
                      `[pulse:orphan] Failed to recover step ${row.id}:`,
                      updErr.message,
                    )
                    continue
                  }
                  console.warn(
                    `[pulse:orphan] Recovered stuck orchestration_step ${row.id} (run=${row.run_id} event=${row.event_id} dag_node=${row.dag_node_id ?? '-'} attempt→${(row.attempt ?? 0) + 1})`,
                  )
                }
                incPulseOrphanedSteps(stuck.length)
              }
            } catch (stepErr) {
              console.warn(
                '[pulse:orphan] Step recovery error:',
                stepErr instanceof Error ? stepErr.message : stepErr,
              )
            }
          } catch (err) {
            console.warn('[pulse:orphan] Failed to reset stuck DB events:', err instanceof Error ? err.message : err)
          }
        }

        if (orphansFound > 0) {
          console.log(
            `[pulse:orphan] Detected ${orphansFound} orphaned runs, reset ${counterResets} counters`,
          )
        }

        return { orphansFound, counterResets }
        }) // end withSpan
      } finally {
        // Release lock atomically
        try {
          await redis.eval(
            PLAIN_CONDITIONAL_DEL_LUA,
            [PulseKeys.orphanLock()],
            [lockValue],
          )
        } catch {
          // Lock will expire via TTL
        }
      }
    } catch (err) {
      console.error('[pulse:orphan] Error:', err instanceof Error ? err.message : err)
      return { orphansFound: 0, counterResets: 0 }
    } finally {
      this.running = false
    }
  }
}
