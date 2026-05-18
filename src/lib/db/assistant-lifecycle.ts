import 'server-only'

import { supabase } from './client'
import { ErrorService } from '@/lib/errors/error-service'
import { destroyRuntimeViaL2 } from '@/app/api/runtimes/_deploy'
import { revokeRuntime } from './mission-control'

/**
 * Pre-delete cleanup for assistant deletion.
 *
 * Handles infrastructure teardown that PostgreSQL CASCADE cannot reach:
 * 1. Dedicated runtimes - revoke if this is the sole agent, preventing orphaned Railway services
 * 2. Pending approvals - resolve as denied so the worker approval gate doesn't poll forever
 *
 * Must be called BEFORE deleteAssistant(). Approval cleanup remains best-effort.
 * Dedicated runtime teardown is best-effort after revocation, matching the
 * runtime DELETE route semantics so agent deletion does not fail just because
 * the provider terminate call is slow or already converged.
 */
export async function prepareAssistantDeletion({
  assistantId,
  orgId,
  runtimeId,
}: {
  assistantId: string
  orgId: string | null
  runtimeId: string | null
}): Promise<void> {
  if (runtimeId && orgId) {
    await cleanupDedicatedRuntime(assistantId, orgId, runtimeId)
  }

  try {
    await denyPendingApprovals(assistantId)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: { assistantId, operation: 'prepareAssistantDeletion.approvals' },
      tags: { layer: 'database', table: 'mc_pending_approvals' },
    })
  }
}

// Runtime cleanup

/**
 * If this agent is the sole occupant of a dedicated runtime, revoke it
 * and confirm provider teardown before allowing the assistant delete to continue.
 *
 * If other agents share the runtime, leave it running - they still need it.
 */
async function cleanupDedicatedRuntime(
  assistantId: string,
  orgId: string,
  runtimeId: string,
): Promise<void> {
  const { count, error: countErr } = await supabase
    .from('ai_assistants')
    .select('id', { count: 'exact', head: true })
    .eq('runtime_id', runtimeId)
    .eq('org_id', orgId)

  if (countErr) throw countErr

  if (count !== 1) {
    return
  }

  const { data: runtime, error: runtimeError } = await supabase
    .from('dedicated_runtimes')
    .select('l2_deployment_id, l2_passport_id')
    .eq('id', runtimeId)
    .eq('org_id', orgId)
    .single()

  if (runtimeError) throw runtimeError

  const revokeResult = await revokeRuntime(runtimeId, orgId)
  if (!revokeResult.success) {
    throw new Error(revokeResult.error ?? `Failed to revoke dedicated runtime ${runtimeId}`)
  }

  if (runtime?.l2_deployment_id || runtime?.l2_passport_id) {
    void destroyRuntimeViaL2(
      runtime.l2_deployment_id ?? '',
      runtimeId,
      runtime.l2_passport_id ?? null,
    )
      .then((deleted) => {
        if (!deleted) {
          ErrorService.captureException(
            new Error(`Failed to delete dedicated provider runtime for assistant ${assistantId}`),
            {
              severity: 'warning',
              context: { assistantId, runtimeId, operation: 'prepareAssistantDeletion.runtimeTeardown' },
              tags: { layer: 'database', table: 'dedicated_runtimes' },
            },
          )
        }
      })
      .catch((error) => {
        ErrorService.captureException(error as Error, {
          severity: 'warning',
          context: { assistantId, runtimeId, operation: 'prepareAssistantDeletion.runtimeTeardown' },
          tags: { layer: 'database', table: 'dedicated_runtimes' },
        })
      })
  }
}

// Approval cleanup

/**
 * Auto-deny any pending approval requests for this agent.
 *
 * The mc_pending_approvals rows would CASCADE-delete anyway, but resolving
 * them first gives the worker's approval gate a clean "denied" signal
 * instead of a missing-row surprise during an in-flight run.
 */
async function denyPendingApprovals(assistantId: string): Promise<void> {
  const { error } = await supabase
    .from('mc_pending_approvals')
    .update({
      status: 'denied',
      resolved_at: new Date().toISOString(),
      resolved_by: 'system:agent_deleted',
    })
    .eq('agent_id', assistantId)
    .eq('status', 'pending')

  if (error) throw error
}
