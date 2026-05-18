/**
 * Pulse Agent Runs — DB wiring for the agent_runs ledger.
 *
 * Best-effort inserts/updates to agent_runs table on claim/complete/fail/DLQ.
 * All operations are non-blocking — DB is for observability,
 * Redis is source of truth for the queue state machine.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PulseJob } from './types.js'

let supabase: SupabaseClient | null = null

/** Initialize with a Supabase client (called once at startup) */
export function initAgentRuns(client: SupabaseClient): void {
  supabase = client
}

/** Record a new agent run on successful claim */
export function recordClaim(job: PulseJob, workerId: string, leaseTtlSeconds: number): void {
  if (!supabase) return
  const leaseExpiresAt = new Date(Date.now() + leaseTtlSeconds * 1000).toISOString()

  void Promise.resolve(
    supabase
      .from('agent_runs')
      .upsert({
        agent_id: job.agentId,
        org_id: job.orgId,
        event_type: job.eventType,
        event_id: job.eventId,
        worker_id: workerId,
        status: 'claimed',
        priority: job.priority,
        attempt: job.attempt + 1, // DB uses 1-based attempts
        lease_expires_at: leaseExpiresAt,
      }, { onConflict: 'event_id,event_type,attempt', ignoreDuplicates: true })
  ).then(({ error }) => {
    if (error) {
      console.warn('[pulse:agent-runs] Failed to record claim:', error.message)
    }
  }).catch((err: unknown) => {
    console.warn('[pulse:agent-runs] Failed to record claim:', err)
  })
}

/** Update agent run on successful completion */
export function recordComplete(job: PulseJob, durationMs: number): void {
  if (!supabase) return

  void Promise.resolve(
    supabase
      .from('agent_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq('event_id', job.eventId)
      .eq('event_type', job.eventType)
      .eq('attempt', job.attempt + 1) // DB uses 1-based attempts
      .eq('status', 'claimed')
  ).then(({ error }) => {
    if (error) {
      console.warn('[pulse:agent-runs] Failed to record complete:', error.message)
    }
  }).catch((err: unknown) => {
    console.warn('[pulse:agent-runs] Failed to record complete:', err)
  })
}

/** Update agent run on failure */
export function recordFail(job: PulseJob, errorMessage?: string): void {
  if (!supabase) return

  void Promise.resolve(
    supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMessage || 'Processing failed',
      })
      .eq('event_id', job.eventId)
      .eq('event_type', job.eventType)
      .eq('attempt', job.attempt + 1) // DB uses 1-based attempts
      .eq('status', 'claimed')
  ).then(({ error }) => {
    if (error) {
      console.warn('[pulse:agent-runs] Failed to record fail:', error.message)
    }
  }).catch((err: unknown) => {
    console.warn('[pulse:agent-runs] Failed to record fail:', err)
  })
}

/** Update agent run on DLQ */
export function recordDlq(job: PulseJob, errorMessage?: string): void {
  if (!supabase) return

  void Promise.resolve(
    supabase
      .from('agent_runs')
      .update({
        status: 'dlq',
        completed_at: new Date().toISOString(),
        error_message: errorMessage || 'Max attempts exceeded',
      })
      .eq('event_id', job.eventId)
      .eq('event_type', job.eventType)
      .eq('attempt', job.attempt + 1) // DB uses 1-based attempts
      .in('status', ['claimed', 'failed'])
  ).then(({ error }) => {
    if (error) {
      console.warn('[pulse:agent-runs] Failed to record DLQ:', error.message)
    }
  }).catch((err: unknown) => {
    console.warn('[pulse:agent-runs] Failed to record DLQ:', err)
  })
}
