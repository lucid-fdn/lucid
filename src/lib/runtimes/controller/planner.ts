import type { DedicatedRuntime, RuntimeMaintenanceState } from '@/lib/mission-control/types'
import type { ManagedRuntimeControllerContext, ManagedRuntimeControllerPlan } from './types'
import { resolveRuntimeImage } from '@/lib/engines/image-resolution'
import { isWithinRuntimeRetryCooldown } from '@/lib/runtimes/policy'

export function resolveDesiredRuntimeImageRef(runtime: DedicatedRuntime): string | null {
  if (!runtime.managedByLucid) return null
  if (!runtime.runtimeFlavor) return null

  try {
    return resolveRuntimeImage(runtime.engine ?? 'openclaw', runtime.runtimeFlavor)
  } catch {
    return null
  }
}

function hasInFlightMaintenance(state: RuntimeMaintenanceState | null): boolean {
  return Boolean(state?.jobs.some((job) => job.status === 'queued' || job.status === 'running'))
}

function isWithinRetryCooldown(runtime: DedicatedRuntime): boolean {
  if (!runtime.lastMaintenanceError || !runtime.lastMaintenanceAt) return false
  return isWithinRuntimeRetryCooldown(runtime.lastMaintenanceAt)
}

function hasRecentFailedAttemptForDesiredImage(
  state: RuntimeMaintenanceState | null,
  desiredImageRef: string,
): boolean {
  const failedAttempt = state?.jobs.find(
    (job) =>
      job.status === 'failed' &&
      job.targetImageRef === desiredImageRef &&
      Boolean(job.completedAt ?? job.createdAt),
  )
  if (!failedAttempt) return false
  return isWithinRuntimeRetryCooldown(failedAttempt.completedAt ?? failedAttempt.createdAt)
}

function shouldFinalizeImageTracking(
  runtime: DedicatedRuntime,
  heartbeatStatus?: 'connected' | 'shutdown',
): boolean {
  return !(
    runtime.managedByLucid !== true ||
    heartbeatStatus === 'shutdown' ||
    !runtime.targetImageRef ||
    runtime.targetImageRef === runtime.currentImageRef
  )
}

export function shouldAutoRedeployRuntime(
  runtime: DedicatedRuntime,
  state: RuntimeMaintenanceState | null,
  desiredImageRef: string | null,
): boolean {
  if (!desiredImageRef) return false
  if (!runtime.managedByLucid || !runtime.l2PassportId) return false
  if (runtime.status === 'revoked') return false
  if (runtime.autoUpdatePolicy === 'manual') return false
  if (hasInFlightMaintenance(state)) return false

  const effectiveImageRef = runtime.targetImageRef ?? runtime.currentImageRef
  if (effectiveImageRef === desiredImageRef) {
    return false
  }

  if (
    (runtime.lastMaintenanceError && isWithinRetryCooldown(runtime)) ||
    hasRecentFailedAttemptForDesiredImage(state, desiredImageRef)
  ) {
    return false
  }

  return true
}

export function planManagedRuntimeSync(
  context: ManagedRuntimeControllerContext,
): ManagedRuntimeControllerPlan {
  const { runtime, state, desiredImageRef, heartbeatStatus } = context

  if (!runtime.managedByLucid || runtime.status === 'revoked') {
    return { kind: 'noop', reason: 'runtime_not_eligible', desiredImageRef }
  }

  if (shouldFinalizeImageTracking(runtime, heartbeatStatus)) {
    return { kind: 'reconcile_image_tracking', reason: 'image_tracking_finalize', desiredImageRef }
  }

  if (runtime.autoUpdatePolicy === 'manual') {
    return { kind: 'noop', reason: 'policy_manual', desiredImageRef }
  }

  if (!desiredImageRef) {
    return { kind: 'noop', reason: 'runtime_not_eligible', desiredImageRef }
  }

  const effectiveImageRef = runtime.targetImageRef ?? runtime.currentImageRef
  if (effectiveImageRef === desiredImageRef) {
    return { kind: 'noop', reason: 'already_converged', desiredImageRef }
  }

  if (hasInFlightMaintenance(state)) {
    return { kind: 'noop', reason: 'maintenance_in_flight', desiredImageRef }
  }

  if (
    (runtime.lastMaintenanceError && isWithinRetryCooldown(runtime)) ||
    hasRecentFailedAttemptForDesiredImage(state, desiredImageRef)
  ) {
    return { kind: 'noop', reason: 'cooldown_active', desiredImageRef }
  }

  return { kind: 'redeploy', reason: 'image_drift', desiredImageRef }
}
