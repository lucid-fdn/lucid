import 'server-only'

import { getRuntimeById, getRuntimeMaintenanceState, listManagedRuntimes, updateRuntimeImageTracking } from '@/lib/db/mission-control'
import { InternalJobLockError, withInternalJobLock } from '@/lib/locks/internal-job-lock'
import { performRuntimeMaintenanceAction } from '@/lib/runtimes/maintenance'
import { planManagedRuntimeSync, resolveDesiredRuntimeImageRef } from './planner'
import type { ManagedRuntimeControllerOutcome, ManagedRuntimeControllerSweepResult } from './types'

export async function syncManagedRuntimeOnHeartbeat(
  runtimeId: string,
  orgId: string,
  heartbeatStatus?: 'connected' | 'shutdown',
): Promise<ManagedRuntimeControllerOutcome> {
  try {
    return await withInternalJobLock(
      `runtime:controller:${runtimeId}`,
      async () => {
        const runtime = await getRuntimeById(runtimeId, orgId)
        if (!runtime) {
          return {
            plan: { kind: 'noop', reason: 'runtime_not_eligible', desiredImageRef: null },
            executed: false,
          }
        }

        const desiredImageRef = resolveDesiredRuntimeImageRef(runtime)
        const state = await getRuntimeMaintenanceState(runtimeId, orgId, 5)
        const plan = planManagedRuntimeSync({
          runtime,
          state,
          desiredImageRef,
          heartbeatStatus,
        })

        if (plan.kind === 'reconcile_image_tracking' && runtime.targetImageRef) {
          await updateRuntimeImageTracking(runtimeId, orgId, {
            currentImageRef: runtime.targetImageRef,
            lastSuccessfulImageRef: runtime.targetImageRef,
          })
          return { plan, executed: true }
        }

        if (plan.kind === 'redeploy') {
          const outcome = await performRuntimeMaintenanceAction({
            runtimeId,
            orgId,
            requestedBy: null,
            action: 'redeploy',
            targetImageRef: plan.desiredImageRef,
          })
          return { plan, executed: outcome.ok }
        }

        return { plan, executed: false }
      },
      60,
    )
  } catch (error) {
    if (error instanceof InternalJobLockError) {
      return {
        plan: { kind: 'noop', reason: 'maintenance_in_flight', desiredImageRef: null },
        executed: false,
      }
    }
    throw error
  }
}

export async function runManagedRuntimeControllerSweep(options?: {
  orgId?: string
  limit?: number
}): Promise<ManagedRuntimeControllerSweepResult> {
  const runtimes = await listManagedRuntimes({
    orgId: options?.orgId,
    limit: options?.limit ?? 100,
  })

  const result: ManagedRuntimeControllerSweepResult = {
    checked: 0,
    executed: 0,
    redeploysQueued: 0,
    imageTrackingReconciled: 0,
    noop: 0,
    errors: [],
  }

  for (const runtime of runtimes) {
    result.checked++
    try {
      const outcome = await syncManagedRuntimeOnHeartbeat(runtime.id, runtime.orgId)
      if (outcome.executed) {
        result.executed++
      } else {
        result.noop++
      }

      if (outcome.plan.kind === 'redeploy' && outcome.executed) {
        result.redeploysQueued++
      }
      if (outcome.plan.kind === 'reconcile_image_tracking' && outcome.executed) {
        result.imageTrackingReconciled++
      }
    } catch (error) {
      result.errors.push({
        runtimeId: runtime.id,
        message: error instanceof Error ? error.message : 'Unknown controller error',
      })
    }
  }

  return result
}

export { planManagedRuntimeSync, resolveDesiredRuntimeImageRef, shouldAutoRedeployRuntime } from './planner'
export type {
  ManagedRuntimeControllerContext,
  ManagedRuntimeControllerOutcome,
  ManagedRuntimeControllerPlan,
  ManagedRuntimeControllerSweepResult,
} from './types'
