/**
 * Pulse Circuit Breaker Fallback — Polling Loops
 *
 * Activates when Redis is unhealthy (circuit open) OR when FEATURE_PULSE=false.
 * All polling loops, backoff, mutex, and cleanup logic live here.
 * index.ts orchestrates modes; this module owns polling state and behavior.
 *
 * Extracted from index.ts (Phase 5) to isolate fallback code from the
 * primary Pulse orchestration path.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import type { EncryptionService } from '../crypto/encryption-service.js'
import { processInboundEvent } from '../processors/inbound.js'
import { processOutboundEvent } from '../processors/outbound.js'
import { processScheduledTask } from '../processors/scheduled.js'
import { InboundDeduper } from '../guards/InboundDeduper.js'
import { withDbSpan } from '../observability/tracing.js'
import { incSchedulerClaimed } from '../observability/metrics.js'
import pLimit from 'p-limit'

type LimitFunction = ReturnType<typeof pLimit>

// ─── Module-Level State ──────────────────────────────────────────────────────

export interface PollingFallbackDeps {
  supabase: SupabaseClient
  config: Config
  encryptionService: EncryptionService
  inboundLimit: LimitFunction
  outboundLimit: LimitFunction
  runInteractive?: boolean
  runAutomation?: boolean
  runMaintenance?: boolean
  broadcastWakeActive?: boolean
  inboundIntervalMs?: number
}

export interface PollingFallbackHandle {
  getMetrics(): {
    inboundFailures: number
    outboundFailures: number
    scheduledTaskFailures: number
    inboundPolling: boolean
    outboundPolling: boolean
  }
}

let deps: PollingFallbackDeps | null = null
let active = false
let generation = 0 // Incremented on each start; stale polls/callbacks bail if generation changed

// Backoff counters
let inboundFailures = 0
let outboundFailures = 0
let scheduledTaskFailures = 0

// Mutex flags
let inboundPolling = false
let outboundPolling = false
let scheduledTaskPolling = false

// Timer references
let inboundTimer: ReturnType<typeof setInterval> | undefined
let outboundTimer: ReturnType<typeof setInterval> | undefined
let cleanupTimer: ReturnType<typeof setInterval> | undefined
let scheduledTaskTimer: ReturnType<typeof setInterval> | undefined
let outboundRpcUnavailableLogged = false

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Sanitize Supabase error messages.
 * When Supabase/Cloudflare returns a 500 HTML page, the JS client puts
 * the entire HTML into `error.message`. Detect and replace with a short summary.
 */
function sanitizeErrorMessage(msg: string): string {
  if (msg && (msg.includes('<!DOCTYPE') || msg.includes('<html'))) {
    const statusMatch = msg.match(/(\d{3}):\s*([^<]+)/i)
    if (statusMatch) return `Supabase returned HTML error: ${statusMatch[1]} ${statusMatch[2].trim()}`
    return 'Supabase returned HTML error page (likely transient 500/502/503)'
  }
  return msg
}

/**
 * Check if we should skip this poll cycle due to backoff.
 * Exponential backoff: skip 1, 2, 4, 8... cycles (capped at 30).
 */
export function shouldBackoff(failures: number): boolean {
  if (failures === 0) return false
  const skipCycles = Math.min(Math.pow(2, failures - 1), 30)
  return Math.random() > (1 / skipCycles)
}

function isMissingOutboundClaimRpc(msg: string): boolean {
  return msg.includes('claim_next_outbound_event') && msg.includes('schema cache')
}

type DirectClaimRow = {
  id: string
  channel_id: string
  inbound_event_id: string | null
  conversation_id: string | null
  message_text: string
  reply_to_external_id: string | null
  attempts: number
  max_attempts: number
  next_attempt_at?: string | null
  status?: string
  locked_until?: string | null
  channel?:
    | {
        assistant?:
          | { runtime_id?: string | null; deleted_at?: string | null }
          | Array<{ runtime_id?: string | null; deleted_at?: string | null }>
      }
    | Array<{
        assistant?:
          | { runtime_id?: string | null; deleted_at?: string | null }
          | Array<{ runtime_id?: string | null; deleted_at?: string | null }>
      }>
}

function extractAssistantRuntimeMeta(row: DirectClaimRow): {
  runtimeId: string | null
  deletedAt: string | null
} {
  const channel = Array.isArray(row.channel) ? row.channel[0] : row.channel
  const assistant = Array.isArray(channel?.assistant) ? channel?.assistant[0] : channel?.assistant
  return {
    runtimeId: assistant?.runtime_id ?? null,
    deletedAt: assistant?.deleted_at ?? null,
  }
}

async function claimOutboundEventsDirect(): Promise<any[]> {
  if (!deps) return []

  const { supabase, config } = deps
  const now = new Date()
  const nowIso = now.toISOString()
  const lockUntilIso = new Date(now.getTime() + 15 * 60_000).toISOString()
  const candidateLimit = Math.max(config.OUTBOUND_BATCH_SIZE * 5, 20)

  const { data, error } = await supabase
    .from('assistant_outbound_events')
    .select(`
      id,
      channel_id,
      inbound_event_id,
      conversation_id,
      message_text,
      reply_to_external_id,
      attempts,
      max_attempts,
      next_attempt_at,
      status,
      locked_until,
      channel:assistant_channels!inner(
        assistant:ai_assistants!inner(
          runtime_id,
          deleted_at
        )
      )
    `)
    .in('status', ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(candidateLimit)

  if (error || !data) {
    throw error ?? new Error('Direct outbound claim query returned no data')
  }

  const claimable = (data as DirectClaimRow[]).filter((row) => {
    const meta = extractAssistantRuntimeMeta(row)
    if (meta.deletedAt) return false
    if (row.attempts >= row.max_attempts) return false
    if (row.next_attempt_at && row.next_attempt_at > nowIso) return false
    if (row.locked_until && row.locked_until > nowIso) return false

    if (config.LUCID_RUNTIME_ID) {
      return meta.runtimeId === config.LUCID_RUNTIME_ID
    }
    return meta.runtimeId == null
  })

  const claimed: any[] = []
  for (const row of claimable) {
    if (claimed.length >= config.OUTBOUND_BATCH_SIZE) break

    const { data: updated, error: updateError } = await supabase
      .from('assistant_outbound_events')
      .update({
        status: 'processing',
        locked_by: config.WORKER_ID,
        locked_at: nowIso,
        locked_until: lockUntilIso,
        attempts: row.attempts + 1,
      })
      .eq('id', row.id)
      .in('status', ['pending', 'failed'])
      .eq('attempts', row.attempts)
      .select(`
        id,
        channel_id,
        inbound_event_id,
        conversation_id,
        message_text,
        reply_to_external_id,
        attempts,
        max_attempts
      `)

    if (updateError) {
      continue
    }

    if (Array.isArray(updated) && updated.length > 0) {
      claimed.push(updated[0])
    }
  }

  return claimed
}

// ─── Polling Functions ───────────────────────────────────────────────────────

async function pollInboundEvents(): Promise<void> {
  if (!deps || !active) return
  if (inboundPolling) return
  if (shouldBackoff(inboundFailures)) return
  inboundPolling = true
  const gen = generation

  try {
    const { supabase, config, encryptionService, inboundLimit } = deps

    const inboundParams: Record<string, unknown> = {
      p_worker_id: config.WORKER_ID,
      p_batch_size: config.INBOUND_BATCH_SIZE,
    }
    if (config.LUCID_RUNTIME_ID) inboundParams.p_runtime_id = config.LUCID_RUNTIME_ID

    const { data: events, error } = await withDbSpan('claim_next_inbound_event', () =>
      supabase.rpc('claim_next_inbound_event', inboundParams)
    )

    if (gen !== generation) return // Session changed during RPC

    if (error) {
      inboundFailures++
      const msg = sanitizeErrorMessage(error.message)
      console.error(`[inbound] Claim error (failure #${inboundFailures}):`, msg)
      return
    }

    inboundFailures = 0

    if (!events || events.length === 0) return

    // Track that fallback polling found events broadcast should have caught
    if (deps.broadcastWakeActive) {
      const { updateCursorFromPolling } = await import('../runtime/broadcast-subscriber.js')
      updateCursorFromPolling(Date.now())
    }

    console.log(`[inbound] Processing ${events.length} events (max ${config.MAX_CONCURRENT_INBOUND} concurrent)`)

    const results = await Promise.allSettled(
      events.map((event: any) => inboundLimit(() => processInboundEvent(event, supabase, config, encryptionService)))
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`[inbound] Batch complete: ${succeeded} ok, ${failed} failed`)
  } catch (err) {
    inboundFailures++
    console.error(`[inbound] Polling error (failure #${inboundFailures}):`, err)
  } finally {
    inboundPolling = false
  }
}

async function pollOutboundEvents(): Promise<void> {
  if (!deps || !active) return
  if (outboundPolling) return
  if (shouldBackoff(outboundFailures)) return
  outboundPolling = true
  const gen = generation

  try {
    const { supabase, config, outboundLimit } = deps

    const outboundParams: Record<string, unknown> = {
      p_worker_id: config.WORKER_ID,
      p_batch_size: config.OUTBOUND_BATCH_SIZE,
    }
    if (config.LUCID_RUNTIME_ID) outboundParams.p_runtime_id = config.LUCID_RUNTIME_ID

    let events: any[] | null = null
    let error: { message: string } | null = null

    const rpcResult = await supabase.rpc('claim_next_outbound_event', outboundParams)
    events = rpcResult.data
    error = rpcResult.error

    if (gen !== generation) return // Session changed during RPC

    if (error) {
      const msg = sanitizeErrorMessage(error.message)
      if (isMissingOutboundClaimRpc(msg)) {
        if (!outboundRpcUnavailableLogged) {
          outboundRpcUnavailableLogged = true
          console.warn(
            '[outbound] claim_next_outbound_event RPC missing from PostgREST schema cache — ' +
            'falling back to direct optimistic claim path until schema cache is reloaded',
          )
        }
        events = await claimOutboundEventsDirect()
      } else {
        outboundFailures++
        console.error(`[outbound] Claim error (failure #${outboundFailures}):`, msg)
        return
      }
    }

    outboundFailures = 0

    if (!events || events.length === 0) return

    console.log(`[outbound] Sending ${events.length} messages (max ${config.MAX_CONCURRENT_OUTBOUND} concurrent)`)

    const results = await Promise.allSettled(
      events.map((event: any) => outboundLimit(() => processOutboundEvent(event, supabase, config)))
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`[outbound] Batch complete: ${succeeded} sent, ${failed} failed`)
  } catch (err) {
    outboundFailures++
    console.error(`[outbound] Polling error (failure #${outboundFailures}):`, err)
  } finally {
    outboundPolling = false
  }
}

async function cleanupStuckEvents(): Promise<void> {
  if (!deps || !active) return
  const gen = generation

  try {
    const { supabase, config } = deps
    const { data, error } = await supabase.rpc('reset_stuck_events')

    if (gen !== generation) return

    if (error) {
      console.error('[cleanup] Error:', sanitizeErrorMessage(error.message))
      return
    }

    if (data.inbound_reset > 0 || data.outbound_reset > 0) {
      console.log(`[cleanup] Reset ${data.inbound_reset} inbound, ${data.outbound_reset} outbound stuck events`)
    }

    // Clean up expired dedup entries
    const deduper = new InboundDeduper(supabase, config.DEDUP_TTL_HOURS)
    await deduper.cleanup()

    // Reset stuck scheduled tasks
    const { data: resetCount } = await supabase.rpc('reset_stuck_scheduled_tasks', { p_timeout_minutes: 10 })
    if (resetCount && resetCount > 0) {
      console.log(`[cleanup] Reset ${resetCount} stuck scheduled tasks`)
    }

    // Reset stuck summary jobs
    const { data: resetSummary } = await supabase.rpc('reset_stuck_summary_jobs', { p_timeout_minutes: 5 })
    if (resetSummary && resetSummary > 0) {
      console.log(`[cleanup] Reset ${resetSummary} stuck summary jobs`)
    }
  } catch (err) {
    console.error('[cleanup] Error:', err)
  }
}

async function pollScheduledTasks(): Promise<void> {
  if (!deps || !active) return
  if (scheduledTaskPolling) return
  if (shouldBackoff(scheduledTaskFailures)) return
  scheduledTaskPolling = true
  const gen = generation

  try {
    const { supabase, config } = deps

    const { data: tasks, error } = await withDbSpan('claim_next_scheduled_task', () =>
      supabase.rpc('claim_next_scheduled_task', {
        p_worker_id: config.WORKER_ID,
        p_batch_size: 5,
      })
    )

    if (gen !== generation) return

    if (error) {
      scheduledTaskFailures++
      const msg = sanitizeErrorMessage(error.message)
      console.error(`[scheduler] Claim error (failure #${scheduledTaskFailures}):`, msg)
      return
    }

    scheduledTaskFailures = 0

    if (!tasks || tasks.length === 0) return

    incSchedulerClaimed(tasks.length)
    console.log(`[scheduler] Processing ${tasks.length} scheduled tasks (max 3 concurrent)`)

    const scheduledLimit = pLimit(3)
    await Promise.allSettled(
      tasks.map((task: any) => scheduledLimit(async () => {
        try {
          await processScheduledTask(task, supabase, config)
        } catch (err) {
          console.error(`[scheduler] Task ${task.id} failed:`, err instanceof Error ? err.message : err)
        }
      }))
    )
  } catch (err) {
    scheduledTaskFailures++
    console.error(`[scheduler] Polling error (failure #${scheduledTaskFailures}):`, err)
  } finally {
    scheduledTaskPolling = false
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Trigger an immediate inbound poll. Safe to call before start() (no-op).
 * Uses setImmediate to avoid blocking the caller.
 */
export function triggerInboundPoll(): void {
  if (!deps || !active) return
  const gen = generation
  setImmediate(() => { if (gen === generation) pollInboundEvents() })
}

/**
 * Trigger an immediate outbound poll. Safe to call before start() (no-op).
 */
export function triggerOutboundPoll(): void {
  if (!deps || !active) return
  const gen = generation
  setImmediate(() => { if (gen === generation) pollOutboundEvents() })
}

/**
 * Start all polling loops with the given dependencies.
 * Idempotent: if already started, stops first then restarts.
 * Performs an immediate first poll on start.
 */
export function startPollingFallback(newDeps: PollingFallbackDeps): PollingFallbackHandle {
  // Idempotent: stop existing if running
  if (active) {
    stopPollingFallback()
  }

  deps = newDeps
  active = true
  generation++
  outboundRpcUnavailableLogged = false

  // Reset counters
  inboundFailures = 0
  outboundFailures = 0
  scheduledTaskFailures = 0
  inboundPolling = false
  outboundPolling = false
  scheduledTaskPolling = false

  const inboundInterval = newDeps.inboundIntervalMs ?? newDeps.config.INBOUND_POLL_INTERVAL
  const runInteractive = newDeps.runInteractive ?? true
  const runAutomation = newDeps.runAutomation ?? true
  const runMaintenance = newDeps.runMaintenance ?? true

  if (runInteractive) {
    inboundTimer = setInterval(pollInboundEvents, inboundInterval)
    outboundTimer = setInterval(pollOutboundEvents, newDeps.config.OUTBOUND_POLL_INTERVAL)
  }
  if (runMaintenance) {
    cleanupTimer = setInterval(cleanupStuckEvents, newDeps.config.CLEANUP_INTERVAL)
  }
  if (runAutomation) {
    scheduledTaskTimer = setInterval(pollScheduledTasks, newDeps.config.SCHEDULED_TASK_POLL_INTERVAL)
  }

  // Immediate first poll (M2 fix: catch-up poll on activation)
  const gen = generation
  setImmediate(() => {
    if (gen !== generation) return // Stale callback from previous session
    if (runInteractive) {
      pollInboundEvents()
      pollOutboundEvents()
    }
    if (runAutomation) {
      pollScheduledTasks()
    }
  })

  return {
    getMetrics() {
      return {
        inboundFailures,
        outboundFailures,
        scheduledTaskFailures,
        inboundPolling,
        outboundPolling,
      }
    },
  }
}

/**
 * Stop all polling loops and clear state.
 * Idempotent: safe to call multiple times or when not started.
 */
export function stopPollingFallback(): void {
  active = false

  if (inboundTimer) { clearInterval(inboundTimer); inboundTimer = undefined }
  if (outboundTimer) { clearInterval(outboundTimer); outboundTimer = undefined }
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = undefined }
  if (scheduledTaskTimer) { clearInterval(scheduledTaskTimer); scheduledTaskTimer = undefined }

  deps = null
}
