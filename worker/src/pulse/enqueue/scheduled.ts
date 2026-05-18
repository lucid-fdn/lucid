/**
 * Pulse Scheduled Task Enqueuer (Wake Scanner)
 *
 * Due-task scan with `ai_assistants.next_wake_at` as an optimization signal:
 *
 * 1. Read woken assistants for telemetry and future sharding hints.
 * 2. Query indexed due tasks directly:
 *    agent_scheduled_tasks WHERE status='pending' AND next_run_at <= NOW().
 *
 * Order: enqueue first (ZADD NX = idempotent via deterministic job ID),
 * then UPDATE DB. If DB update fails, next scan re-enqueues the same ID
 * (NX prevents duplicates).
 *
 * Correctness does not depend on next_wake_at. Manual run-now and stale wake
 * hints still fire because the due-task query is the source of truth.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { PulseQueue } from '../queue.js'
import { publishPulseWake } from '../wake-signal.js'

/**
 * Wake scanner: finds scheduled tasks ready to fire and enqueues them.
 * Uses deterministic job IDs for idempotency: sched:{taskId}:{isoTimestamp}
 */
export async function scanAndEnqueueScheduledTasks(
  queue: PulseQueue,
  supabase: SupabaseClient,
): Promise<number> {
  const now = new Date().toISOString()

  // ── Tier 1: Agent-level pre-filter via next_wake_at ──
  const { data: wokenAgents } = await supabase
    .from('ai_assistants')
    .select('id')
    .lte('next_wake_at', now)
    .is('deleted_at', null)
    .limit(50)

  const agentIds = wokenAgents?.map((a) => a.id) ?? []

  // ── Tier 2: Task-level scan ──
  // `next_wake_at` is an optimization, not a correctness boundary. Run the
  // indexed due-task query first so run-now/manual triggers cannot be stranded
  // by stale assistant wake hints. The agent pre-filter remains useful as a
  // telemetry signal and future sharding hint.
  const { data: tasks, error } = await supabase
    .from('agent_scheduled_tasks')
    .select('id, assistant_id, org_id, next_run_at')
    .in('status', ['pending', 'failed'])
    .eq('enabled', true)
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(20)

  if (error || !tasks || tasks.length === 0) return 0

  let enqueued = 0
  for (const task of tasks) {
    // Enqueue to Redis first (ZADD NX = idempotent via deterministic ID)
    const success = await queue.enqueue({
      eventId: task.id,
      eventType: 'scheduled',
      agentId: task.assistant_id,
      orgId: task.org_id,
      priority: 'normal',
    })

    if (success) {
      enqueued++

      // Mark as claimed in DB to prevent re-scan
      await supabase
        .from('agent_scheduled_tasks')
        .update({
          status: 'claimed',
          claimed_by: 'pulse-scanner',
          claimed_at: new Date().toISOString(),
        })
        .eq('id', task.id)
        .in('status', ['pending', 'failed']) // Optimistic lock
    }
  }

  if (enqueued > 0) {
    console.log(`[pulse:wake] Enqueued ${enqueued}/${tasks.length} scheduled tasks (agents: ${agentIds.length} woken)`)
    publishPulseWake('scheduled')
  }

  return enqueued
}
