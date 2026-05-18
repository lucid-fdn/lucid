import type { DedicatedRuntime, RuntimeMaintenanceState } from '@/lib/mission-control/types'

export type ManagedRuntimeControllerReason =
  | 'image_drift'
  | 'image_tracking_finalize'
  | 'cooldown_active'
  | 'maintenance_in_flight'
  | 'policy_manual'
  | 'runtime_not_eligible'
  | 'already_converged'

export interface ManagedRuntimeControllerPlan {
  kind: 'noop' | 'reconcile_image_tracking' | 'redeploy'
  reason: ManagedRuntimeControllerReason
  desiredImageRef: string | null
}

export interface ManagedRuntimeControllerContext {
  runtime: DedicatedRuntime
  state: RuntimeMaintenanceState | null
  desiredImageRef: string | null
  heartbeatStatus?: 'connected' | 'shutdown'
}

export interface ManagedRuntimeControllerOutcome {
  plan: ManagedRuntimeControllerPlan
  executed: boolean
}

export interface ManagedRuntimeControllerSweepResult {
  checked: number
  executed: number
  redeploysQueued: number
  imageTrackingReconciled: number
  noop: number
  errors: Array<{ runtimeId: string; message: string }>
}
