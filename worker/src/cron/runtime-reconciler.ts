/**
 * Mission Control — Runtime Reconciler (60s Cron)
 *
 * Detects and repairs drift between desired and actual state for:
 * 1. Agent status — stuck agents, failed agents that should restart
 * 2. Runtime health — offline runtimes with active agents
 * 3. Stuck events — events claimed but never completed
 * 4. Dead-lettered agents — agents with too many dead letters get paused
 *
 * Ported from Lucid-L2's ReconcilerService pattern, adapted for
 * LucidMerged's SaaS + dedicated runtime model.
 *
 * Called from the worker's cron loop every 60 seconds.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { transitionAgentStatus, type AgentStatus } from '../lib/agent-state-machine.js'
import { captureError, captureMessage } from '../monitoring/sentry.js'

// ─── Configuration ───

export interface ReconcilerConfig {
  /** How long before a runtime is considered stale (ms). Default: 5 min */
  runtimeStaleThresholdMs: number
  /** How long before a runtime is considered offline (ms). Default: 1 hour */
  runtimeOfflineThresholdMs: number
  /** Max dead-lettered events before auto-pausing agent. Default: 10 */
  deadLetterPauseThreshold: number
  /** Max stuck inbound events (claimed > 15 min) to reset per sweep. Default: 50 */
  stuckEventResetLimit: number
  /** Auto-resume agents on runtimes that come back online. Default: true */
  autoResumeOnReconnect: boolean
}

const DEFAULT_CONFIG: ReconcilerConfig = {
  runtimeStaleThresholdMs: 5 * 60 * 1000,
  runtimeOfflineThresholdMs: 60 * 60 * 1000,
  deadLetterPauseThreshold: 10,
  stuckEventResetLimit: 50,
  autoResumeOnReconnect: true,
}

const L2_API_URL_ENV_NAMES = [
  'LUCID_L2_API_URL',
] as const

const L2_ADMIN_KEY_ENV_NAMES = [
  'LUCID_L2_ADMIN_KEY',
] as const

function firstConfiguredEnv(names: readonly string[]): string | null {
  for (const name of names) {
    const value = normalizeEnvValue(process.env[name])
    if (value) return value
  }
  return null
}

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || null
  }
  return trimmed
}

function getL2BaseUrl(): string | null {
  return firstConfiguredEnv(L2_API_URL_ENV_NAMES)?.replace(/\/api\/?$/, '') ?? null
}

function getL2AuthHeaders(): Record<string, string> {
  const key = firstConfiguredEnv(L2_ADMIN_KEY_ENV_NAMES)
  return key ? { Authorization: `Bearer ${key}` } : {}
}

// ─── Sweep Result ───

export interface ReconcilerSweepResult {
  runtimesMarkedStale: number
  runtimesMarkedOffline: number
  runtimesTornDown: number
  agentsPaused: number
  agentsResumed: number
  stuckEventsReset: number
  intentsCleaned: number
  crewRunsTimedOut: number
  errors: string[]
}

// ─── Main Entry Point ───

/**
 * Run one reconciliation sweep. Called every 60s from worker cron loop.
 */
export async function runReconcilerSweep(
  supabase: SupabaseClient,
  configOverrides?: Partial<ReconcilerConfig>,
): Promise<ReconcilerSweepResult> {
  const config = { ...DEFAULT_CONFIG, ...configOverrides }
  const result: ReconcilerSweepResult = {
    runtimesMarkedStale: 0,
    runtimesMarkedOffline: 0,
    runtimesTornDown: 0,
    agentsPaused: 0,
    agentsResumed: 0,
    stuckEventsReset: 0,
    intentsCleaned: 0,
    crewRunsTimedOut: 0,
    errors: [],
  }

  try {
    // Run independent checks in parallel
    const [runtimeResult, deadLetterResult, stuckResult, teardownResult, intentResult, crewRunResult] = await Promise.allSettled([
      reconcileRuntimeHealth(supabase, config, result),
      reconcileDeadLetteredAgents(supabase, config, result),
      reconcileStuckEvents(supabase, config, result),
      reconcileRevokedRuntimes(supabase, result),
      reconcileOrphanedIntents(supabase, result),
      reconcileStaleCrewRuns(supabase, config, result),
    ])

    // Collect errors
    for (const r of [runtimeResult, deadLetterResult, stuckResult, teardownResult, intentResult, crewRunResult]) {
      if (r.status === 'rejected') {
        result.errors.push(r.reason?.message || 'Unknown error')
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Sweep failed')
  }

  // Log summary if anything happened
  const anyAction =
    result.runtimesMarkedStale > 0 ||
    result.runtimesMarkedOffline > 0 ||
    result.runtimesTornDown > 0 ||
    result.agentsPaused > 0 ||
    result.agentsResumed > 0 ||
    result.stuckEventsReset > 0 ||
    result.intentsCleaned > 0 ||
    result.crewRunsTimedOut > 0

  if (anyAction) {
    console.log(
      `[reconciler] Sweep: stale=${result.runtimesMarkedStale} offline=${result.runtimesMarkedOffline} ` +
      `torn_down=${result.runtimesTornDown} paused=${result.agentsPaused} resumed=${result.agentsResumed} ` +
      `stuck_reset=${result.stuckEventsReset} intents_cleaned=${result.intentsCleaned} crew_runs_timed_out=${result.crewRunsTimedOut}` +
      (result.errors.length > 0 ? ` errors=${result.errors.length}` : '')
    )
  }

  return result
}

// ─── Runtime Health Reconciliation ───

/**
 * Check dedicated runtimes for staleness/offline and handle agents accordingly:
 * - Mark connected → stale (> 5 min no heartbeat)
 * - Mark stale → offline (> 1 hour no heartbeat)
 * - Pause active agents on offline runtimes
 * - Resume paused agents when runtime reconnects (if auto-resume enabled)
 */
async function reconcileRuntimeHealth(
  supabase: SupabaseClient,
  config: ReconcilerConfig,
  result: ReconcilerSweepResult,
): Promise<void> {
  const now = Date.now()
  const staleThreshold = new Date(now - config.runtimeStaleThresholdMs).toISOString()
  const offlineThreshold = new Date(now - config.runtimeOfflineThresholdMs).toISOString()

  // 1. Mark connected → stale
  const { data: newlyStale } = await supabase
    .from('dedicated_runtimes')
    .update({ status: 'stale' })
    .eq('status', 'connected')
    .lt('last_seen_at', staleThreshold)
    .select('id, org_id, display_name')

  result.runtimesMarkedStale = newlyStale?.length ?? 0

  // 2. Mark stale → offline
  const { data: newlyOffline } = await supabase
    .from('dedicated_runtimes')
    .update({ status: 'offline' })
    .eq('status', 'stale')
    .lt('last_seen_at', offlineThreshold)
    .select('id, org_id, display_name')

  result.runtimesMarkedOffline = newlyOffline?.length ?? 0

  // 3. Pause active agents on newly-offline runtimes
  if (newlyOffline && newlyOffline.length > 0) {
    for (const runtime of newlyOffline) {
      await pauseAgentsOnRuntime(supabase, runtime.id, runtime.org_id, runtime.display_name, result)
    }
  }

  // 4. Auto-resume agents on runtimes that just reconnected
  // (The heartbeat handler already sets status → connected, so we check
  //  for runtimes that are connected but have paused agents with a reconciler reason)
  if (config.autoResumeOnReconnect) {
    await resumeAgentsOnReconnectedRuntimes(supabase, result)
  }
}

/**
 * Pause all active agents assigned to a runtime that just went offline.
 */
async function pauseAgentsOnRuntime(
  supabase: SupabaseClient,
  runtimeId: string,
  orgId: string,
  runtimeName: string,
  result: ReconcilerSweepResult,
): Promise<void> {
  const { data: agents } = await supabase
    .from('ai_assistants')
    .select('id, mc_status')
    .eq('runtime_id', runtimeId)
    .eq('org_id', orgId)
    .is('deleted_at', null)

  if (!agents) return

  for (const agent of agents) {
    const status = (agent.mc_status || 'active') as AgentStatus
    if (status !== 'active') continue

    const transition = await transitionAgentStatus(
      supabase, agent.id, orgId, 'paused',
      {
        actor: 'reconciler',
        reason: `Runtime '${runtimeName}' went offline`,
        metadata: { runtimeId, trigger: 'runtime_offline' },
      }
    )

    if (transition.success) {
      result.agentsPaused++
    }
  }
}

/**
 * Resume agents that were paused by the reconciler when their runtime comes back.
 *
 * Only resumes agents whose last status change was caused by the reconciler
 * with a runtime_offline trigger (don't resume manually paused agents).
 */
async function resumeAgentsOnReconnectedRuntimes(
  supabase: SupabaseClient,
  result: ReconcilerSweepResult,
): Promise<void> {
  // Find connected runtimes that have paused agents
  const { data: connectedRuntimes } = await supabase
    .from('dedicated_runtimes')
    .select('id, org_id')
    .eq('status', 'connected')

  if (!connectedRuntimes || connectedRuntimes.length === 0) return

  for (const runtime of connectedRuntimes) {
    // Find paused agents on this runtime
    const { data: pausedAgents } = await supabase
      .from('ai_assistants')
      .select('id')
      .eq('runtime_id', runtime.id)
      .eq('org_id', runtime.org_id)
      .eq('mc_status', 'paused')
      .is('deleted_at', null)

    if (!pausedAgents || pausedAgents.length === 0) continue

    // Check if the most recent event for each agent was a reconciler pause
    for (const agent of pausedAgents) {
      const { data: lastEvent } = await supabase
        .from('runtime_events')
        .select('payload')
        .eq('agent_id', agent.id)
        .eq('org_id', runtime.org_id)
        .eq('event_type', 'agent_paused')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const payload = lastEvent?.payload as Record<string, unknown> | null
      if (payload?.actor === 'reconciler' && payload?.trigger === 'runtime_offline') {
        const transition = await transitionAgentStatus(
          supabase, agent.id, runtime.org_id, 'active',
          {
            actor: 'reconciler',
            reason: 'Runtime reconnected',
            metadata: { runtimeId: runtime.id, trigger: 'runtime_reconnected' },
          }
        )

        if (transition.success) {
          result.agentsResumed++
        }
      }
    }
  }
}

// ─── Revoked Runtime Teardown (Eventual Consistency) ───

/**
 * Retry L2 infrastructure teardown for revoked runtimes with exponential backoff.
 *
 * Completion marker: l2_deployment_id = NULL means infra is torn down.
 * Pending: status = 'revoked' AND l2_deployment_id IS NOT NULL.
 *
 * 3-layer teardown guarantee:
 *   Layer 1: DB revoke (synchronous, always succeeds)
 *   Layer 2: Immediate L2 destroy call (best-effort fast path)
 *   Layer 3: This reconciler sweep (retries with backoff until success)
 *
 * Backoff schedule: 60s → 2m → 4m → 8m → 16m → 32m → 1h (capped)
 * Alerting tiers:
 *   - 5 failures  → warning event in MC live feed
 *   - 10 failures → Sentry error (pages on-call)
 */

/** Backoff: min(60s * 2^attempts, 1 hour) */
function teardownBackoffMs(attempts: number): number {
  return Math.min(60_000 * Math.pow(2, attempts), 3_600_000)
}

/** Alert thresholds */
const TEARDOWN_WARN_THRESHOLD = 5
const TEARDOWN_ALERT_THRESHOLD = 10

async function reconcileRevokedRuntimes(
  supabase: SupabaseClient,
  result: ReconcilerSweepResult,
): Promise<void> {
  // Find revoked runtimes that still have infrastructure running
  const { data: pending } = await supabase
    .from('dedicated_runtimes')
    .select('id, org_id, display_name, l2_deployment_id, teardown_attempts, teardown_last_attempt_at')
    .eq('status', 'revoked')
    .not('l2_deployment_id', 'is', null)
    .limit(10) // Batch size per sweep to avoid L2 overload

  if (!pending || pending.length === 0) return

  const l2Base = getL2BaseUrl()
  if (!l2Base) return // L2 not configured — can't tear down

  const now = Date.now()

  for (const runtime of pending) {
    const attempts = runtime.teardown_attempts ?? 0
    const lastAttempt = runtime.teardown_last_attempt_at
      ? new Date(runtime.teardown_last_attempt_at).getTime()
      : 0

    // Skip if backoff period hasn't elapsed
    if (lastAttempt > 0 && now - lastAttempt < teardownBackoffMs(attempts)) {
      continue
    }

    try {
      const res = await fetch(
        `${l2Base}/v1/agents/deployments/${encodeURIComponent(runtime.l2_deployment_id)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...getL2AuthHeaders(),
          },
          signal: AbortSignal.timeout(30_000),
        }
      )

      if (res.ok || res.status === 404) {
        // 200 = destroyed, 404 = already gone — both mean teardown complete
        await supabase
          .from('dedicated_runtimes')
          .update({
            l2_deployment_id: null,
            deployment_url: null,
            teardown_attempts: 0,
            teardown_last_attempt_at: null,
          })
          .eq('id', runtime.id)

        result.runtimesTornDown++
      } else {
        const errText = await res.text().catch(() => '')
        await recordTeardownFailure(supabase, runtime, attempts + 1, errText)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await recordTeardownFailure(supabase, runtime, attempts + 1, errMsg)
    }
  }
}

/**
 * Record a teardown failure: increment attempts, update timestamp, and
 * emit tiered alerts at defined thresholds.
 */
async function recordTeardownFailure(
  supabase: SupabaseClient,
  runtime: { id: string; org_id: string; display_name: string; l2_deployment_id: string },
  newAttempts: number,
  errorDetail: string,
): Promise<void> {
  const nextBackoff = teardownBackoffMs(newAttempts)

  // Update attempt counter
  await supabase
    .from('dedicated_runtimes')
    .update({
      teardown_attempts: newAttempts,
      teardown_last_attempt_at: new Date().toISOString(),
    })
    .eq('id', runtime.id)

  // Tier 1: Warning in MC live feed (visible to org admins)
  if (newAttempts === TEARDOWN_WARN_THRESHOLD) {
    await supabase.from('runtime_events').insert({
      runtime_id: runtime.id,
      org_id: runtime.org_id,
      agent_id: null,
      event_type: 'error',
      severity: 'warning',
      payload: {
        type: 'teardown_stalled',
        runtimeName: runtime.display_name,
        l2DeploymentId: runtime.l2_deployment_id,
        attempts: newAttempts,
        nextRetrySeconds: Math.round(nextBackoff / 1000),
        message: `Infrastructure teardown for '${runtime.display_name}' has failed ${newAttempts} times. ` +
          `The Railway/Akash service may still be running and billing. Next retry in ${Math.round(nextBackoff / 60_000)}m.`,
      },
    })
  }

  // Tier 2: Sentry error (pages on-call via captureError)
  if (newAttempts === TEARDOWN_ALERT_THRESHOLD) {
    captureError(
      new Error(
        `Runtime teardown failed ${newAttempts} times — L2 deployment may be orphaned and still billing. ` +
        `Runtime: ${runtime.id}, L2 deployment: ${runtime.l2_deployment_id}. Last error: ${errorDetail}`
      ),
      { runtimeId: runtime.id, l2DeploymentId: runtime.l2_deployment_id, attempts: newAttempts }
    )
  }

  console.warn(
    `[reconciler] L2 teardown failed for ${runtime.id} (attempt ${newAttempts}, ` +
    `next retry in ${Math.round(nextBackoff / 1000)}s): ${errorDetail}`
  )
}

// ─── Dead Letter Reconciliation ───

/**
 * Auto-pause agents that have accumulated too many dead-lettered events.
 * This catches agents that are repeatedly failing without triggering
 * the remediation engine (which requires explicit policy setup).
 */
async function reconcileDeadLetteredAgents(
  supabase: SupabaseClient,
  config: ReconcilerConfig,
  result: ReconcilerSweepResult,
): Promise<void> {
  // Find agents with dead-lettered events above threshold
  const { data: deadLetterCounts } = await supabase
    .from('assistant_inbound_events')
    .select('assistant_id, org_id')
    .eq('status', 'dead_lettered')

  if (!deadLetterCounts || deadLetterCounts.length === 0) return

  // Count per agent
  const agentCounts = new Map<string, { count: number; orgId: string }>()
  for (const row of deadLetterCounts) {
    const key = row.assistant_id
    const existing = agentCounts.get(key)
    if (existing) {
      existing.count++
    } else {
      agentCounts.set(key, { count: 1, orgId: row.org_id })
    }
  }

  // Pause agents over threshold
  for (const [agentId, { count, orgId }] of agentCounts) {
    if (count < config.deadLetterPauseThreshold) continue

    const transition = await transitionAgentStatus(
      supabase, agentId, orgId, 'paused',
      {
        actor: 'reconciler',
        reason: `${count} dead-lettered events (threshold: ${config.deadLetterPauseThreshold})`,
        metadata: { deadLetterCount: count, trigger: 'dead_letter_threshold' },
      }
    )

    if (transition.success) {
      result.agentsPaused++
    }
  }
}

// ─── Stuck Event Reconciliation ───

/**
 * Reset inbound events that have been claimed but not completed within 15 minutes.
 * This is a safety net for worker crashes or OOM kills.
 *
 * Also resets stuck scheduled tasks.
 */
async function reconcileStuckEvents(
  supabase: SupabaseClient,
  config: ReconcilerConfig,
  result: ReconcilerSweepResult,
): Promise<void> {
  const stuckThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  // Reset stuck inbound events (claimed > 15 min ago)
  const { data: stuckInbound } = await supabase
    .from('assistant_inbound_events')
    .update({
      status: 'pending',
      claimed_by: null,
      claimed_at: null,
    })
    .eq('status', 'claimed')
    .lt('claimed_at', stuckThreshold)
    .select('id')
    .limit(config.stuckEventResetLimit)

  result.stuckEventsReset += stuckInbound?.length ?? 0

  // Reset stuck outbound events
  const { data: stuckOutbound } = await supabase
    .from('assistant_outbound_events')
    .update({
      status: 'pending',
      claimed_by: null,
      claimed_at: null,
    })
    .eq('status', 'claimed')
    .lt('claimed_at', stuckThreshold)
    .select('id')
    .limit(config.stuckEventResetLimit)

  result.stuckEventsReset += stuckOutbound?.length ?? 0

  // Reset stuck scheduled tasks (claimed > 10 min)
  const { data: resetCount } = await supabase.rpc('reset_stuck_scheduled_tasks', {
    p_timeout_minutes: 10,
  })

  if (resetCount && resetCount > 0) {
    result.stuckEventsReset += resetCount
  }
}

// ─── Orphaned Deploy Intent Cleanup ───

/**
 * Clean up deploy intents stuck in 'pending' or 'fulfilling' state for > 10 minutes.
 *
 * Cases:
 * 1. Runtime never connected (still deploying/pending after 10 min) → revoke + clean
 * 2. Runtime already failed/revoked → mark intent as cleaned
 * 3. Stuck 'fulfilling' (Vercel function crashed mid-create) → reset to 'pending' for retry
 *
 * "connected + pending" is handled by the heartbeat handler itself —
 * it retries fulfillDeployIntent on every heartbeat while intent_status = 'pending'.
 */
async function reconcileOrphanedIntents(
  supabase: SupabaseClient,
  result: ReconcilerSweepResult,
): Promise<void> {
  const threshold = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const fulfillingThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  // ── 1. Stuck 'fulfilling' intents (claim crashed — 2 min is generous for a Vercel function)
  const { data: stuckFulfilling } = await supabase
    .from('dedicated_runtimes')
    .update({ intent_status: 'pending' }) // Reset to pending so heartbeat retries
    .eq('intent_status', 'fulfilling')
    .lt('created_at', fulfillingThreshold)
    .select('id')

  result.intentsCleaned += stuckFulfilling?.length ?? 0

  // ── 2. Old 'pending' intents (> 10 min)
  const { data: orphaned } = await supabase
    .from('dedicated_runtimes')
    .select('id, org_id, status, display_name, intent_status')
    .eq('intent_status', 'pending')
    .lt('created_at', threshold)
    .limit(20)

  if (!orphaned || orphaned.length === 0) return

  for (const runtime of orphaned) {
    // Case A: Stuck deploying — runtime never connected. Revoke and clean.
    if (runtime.status === 'pending' || runtime.status === 'deploying') {
      await supabase
        .from('dedicated_runtimes')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          intent_status: 'cleaned',
          intent_error: 'Timed out: runtime never connected within 10 minutes',
        })
        .eq('id', runtime.id)
        .eq('intent_status', 'pending')

      result.intentsCleaned++
      captureMessage(
        `[reconciler] Cleaned orphaned deploy intent for runtime '${runtime.display_name}' (${runtime.id}) — never connected`,
        'warning',
        { runtimeId: runtime.id }
      )
      continue
    }

    // Case B: Runtime already failed/revoked — just clean the intent
    if (runtime.status === 'failed' || runtime.status === 'revoked') {
      await supabase
        .from('dedicated_runtimes')
        .update({
          intent_status: 'cleaned',
          intent_error: `Runtime status is '${runtime.status}' — intent cannot be fulfilled`,
        })
        .eq('id', runtime.id)
        .eq('intent_status', 'pending')

      result.intentsCleaned++
      continue
    }

    // Case C: Runtime is connected but intent still pending after 10 min
    // This shouldn't happen (heartbeat retries every 30s), but log for investigation
    if (runtime.status === 'connected') {
      captureMessage(
        `[reconciler] Runtime '${runtime.display_name}' (${runtime.id}) is connected but intent still pending after 10 min — heartbeat should be retrying`,
        'warning',
        { runtimeId: runtime.id }
      )
    }
  }
}

// ─── Stale Crew Run Reconciliation ───

/** Timeout for crew runs with no activity (10 minutes) */
const CREW_RUN_STALE_THRESHOLD_MS = 10 * 60 * 1000

/**
 * Fail crew runs stuck in 'starting' or 'running' with no recent member activity.
 *
 * A run is considered stale when:
 * - Status is 'starting' or 'running'
 * - created_at (for starting) or last member started_at (for running) is > 10min ago
 *
 * This is the safety net — coordinator should call crew_complete normally.
 */
export async function reconcileStaleCrewRuns(
  supabase: SupabaseClient,
  _config: ReconcilerConfig,
  result: ReconcilerSweepResult,
): Promise<void> {
  const threshold = new Date(Date.now() - CREW_RUN_STALE_THRESHOLD_MS).toISOString()

  // Find runs stuck in starting/running that were created before the threshold
  const { data: staleRuns } = await supabase
    .from('crew_runs')
    .select('id, crew_id, org_id, status')
    .in('status', ['starting', 'running'])
    .lt('created_at', threshold)
    .limit(20)

  if (!staleRuns || staleRuns.length === 0) return

  for (const run of staleRuns) {
    // For running runs, check if any member has recent activity
    if (run.status === 'running') {
      const { data: recentMember } = await supabase
        .from('crew_run_members')
        .select('id')
        .eq('crew_run_id', run.id)
        .in('status', ['starting', 'running'])
        .gt('started_at', threshold)
        .limit(1)
        .maybeSingle()

      if (recentMember) continue // Still has active members — not stale
    }

    // Fail the run
    const { error } = await supabase
      .from('crew_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: 'Timed out: no activity for 10 minutes',
      })
      .eq('id', run.id)
      .in('status', ['starting', 'running']) // Race-safe: only update if still active

    if (!error) {
      result.crewRunsTimedOut++

      // Emit feed event (fire-and-forget)
      supabase
        .from('mc_agent_events')
        .insert({
          agent_id: null,
          org_id: run.org_id,
          event_type: 'crew_run_failed',
          payload: {
            crew_id: run.crew_id,
            crew_run_id: run.id,
            reason: 'timeout',
            message: 'Crew run timed out after 10 minutes of inactivity',
          },
        })
        .then(() => {})

      console.warn(`[reconciler] Timed out crew run ${run.id} (crew ${run.crew_id})`)
    }
  }
}
