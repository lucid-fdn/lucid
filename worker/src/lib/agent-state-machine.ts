/**
 * Mission Control — Agent Status State Machine
 *
 * Strict transition validation for agent lifecycle status changes.
 * Ported from Lucid-L2's deployment state machine pattern, adapted for
 * the LucidMerged agent lifecycle (active/paused/stopped/failed).
 *
 * Every mc_status mutation MUST go through assertValidTransition() or
 * transitionAgentStatus() to prevent invalid state changes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Status Types ───

export type AgentStatus = 'active' | 'paused' | 'stopped' | 'failed'

export type AgentStatusEventType =
  | 'agent_activated'
  | 'agent_paused'
  | 'agent_resumed'
  | 'agent_stopped'
  | 'agent_failed'
  | 'agent_restarted'

export type TransitionActor = 'user' | 'remediation' | 'reconciler' | 'system'

// ─── Transition Map ───

const VALID_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  active:  ['paused', 'stopped', 'failed'],
  paused:  ['active', 'stopped'],
  stopped: ['active'],                       // restart goes directly to active
  failed:  ['active', 'stopped'],            // retry or terminate
}

/**
 * Check whether a transition from `from` to `to` is valid.
 */
export function canTransition(from: AgentStatus, to: AgentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Assert a transition is valid. Throws if not.
 */
export function assertValidTransition(from: AgentStatus, to: AgentStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidAgentTransitionError(from, to)
  }
}

export class InvalidAgentTransitionError extends Error {
  constructor(
    public readonly from: AgentStatus,
    public readonly to: AgentStatus,
  ) {
    super(`Invalid agent status transition: ${from} → ${to}`)
    this.name = 'InvalidAgentTransitionError'
  }
}

// ─── Event Mapping ───

function transitionToEventType(from: AgentStatus, to: AgentStatus): AgentStatusEventType {
  if (to === 'active' && from === 'paused') return 'agent_resumed'
  if (to === 'active' && (from === 'stopped' || from === 'failed')) return 'agent_restarted'
  if (to === 'active') return 'agent_activated'
  if (to === 'paused') return 'agent_paused'
  if (to === 'stopped') return 'agent_stopped'
  if (to === 'failed') return 'agent_failed'
  return 'agent_activated' // fallback
}

// ─── DB Transition (atomic) ───

export interface TransitionOptions {
  actor: TransitionActor
  reason?: string
  metadata?: Record<string, unknown>
}

export interface TransitionResult {
  success: boolean
  error?: string
  previousStatus?: AgentStatus
  eventType?: AgentStatusEventType
}

/**
 * Atomically transition an agent's mc_status with validation and event logging.
 *
 * 1. Reads current status
 * 2. Validates transition
 * 3. Updates mc_status
 * 4. Inserts feed event for audit trail
 */
export async function transitionAgentStatus(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  targetStatus: AgentStatus,
  options: TransitionOptions,
): Promise<TransitionResult> {
  // 1. Read current status
  const { data: agent, error: fetchError } = await supabase
    .from('ai_assistants')
    .select('mc_status, name')
    .eq('id', agentId)
    .eq('org_id', orgId)
    .single()

  if (fetchError || !agent) {
    return { success: false, error: fetchError?.message || 'Agent not found' }
  }

  const currentStatus = (agent.mc_status || 'active') as AgentStatus
  const agentName = agent.name || 'Unknown'

  // No-op if already in target state
  if (currentStatus === targetStatus) {
    return { success: true, previousStatus: currentStatus }
  }

  // 2. Validate transition
  if (!canTransition(currentStatus, targetStatus)) {
    const msg = `Invalid transition: ${currentStatus} → ${targetStatus}`
    console.warn(`[state-machine] ${msg} for agent ${agentId}`)
    return { success: false, error: msg, previousStatus: currentStatus }
  }

  // 3. Update mc_status
  const { error: updateError } = await supabase
    .from('ai_assistants')
    .update({ mc_status: targetStatus })
    .eq('id', agentId)
    .eq('org_id', orgId)
    .eq('mc_status', currentStatus)  // optimistic lock — only update if still in expected state

  if (updateError) {
    return { success: false, error: updateError.message, previousStatus: currentStatus }
  }

  // 4. Emit feed event
  const eventType = transitionToEventType(currentStatus, targetStatus)

  await supabase.from('runtime_events').insert({
    runtime_id: null,
    org_id: orgId,
    agent_id: agentId,
    event_type: eventType,
    severity: targetStatus === 'failed' ? 'error' : 'info',
    payload: {
      type: 'status_transition',
      agentName,
      from: currentStatus,
      to: targetStatus,
      actor: options.actor,
      reason: options.reason || null,
      ...(options.metadata || {}),
    },
  }).then(({ error }) => {
    if (error) {
      console.warn(`[state-machine] Failed to emit ${eventType} event:`, error.message)
    }
  })

  console.log(
    `[state-machine] Agent ${agentId} (${agentName}): ${currentStatus} → ${targetStatus} (actor=${options.actor}${options.reason ? `, reason=${options.reason}` : ''})`
  )

  return {
    success: true,
    previousStatus: currentStatus,
    eventType,
  }
}

// ─── Exports ───

export { VALID_TRANSITIONS }
