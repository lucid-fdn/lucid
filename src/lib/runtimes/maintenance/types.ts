import type { DedicatedRuntime, RuntimeMaintenanceAction } from '@/lib/mission-control/types'

export interface RuntimeMaintenanceRequest {
  action: RuntimeMaintenanceAction
  targetImageRef?: string | null
  targetImageDigest?: string | null
  envVars?: Record<string, string>
}

export interface RuntimeMaintenanceResult {
  success: boolean
  action: RuntimeMaintenanceAction
  provider: string
  deploymentId?: string | null
  operationId?: string | null
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  url?: string | null
  detail?: Record<string, unknown>
}

export interface RuntimeMaintenanceProvider {
  readonly name: string
  supports(runtime: DedicatedRuntime, request: RuntimeMaintenanceRequest): boolean
  execute(runtime: DedicatedRuntime, request: RuntimeMaintenanceRequest): Promise<RuntimeMaintenanceResult>
}
