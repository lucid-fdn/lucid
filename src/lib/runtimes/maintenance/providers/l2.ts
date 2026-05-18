import 'server-only'

import type { DedicatedRuntime } from '@/lib/mission-control/types'
import { getL2BaseUrl } from '@/lib/deployment-mode'
import type {
  RuntimeMaintenanceProvider,
  RuntimeMaintenanceRequest,
  RuntimeMaintenanceResult,
} from '../types'
import { deployRailwayServiceFromCurrentSource } from './railway'
import { getL2AdminAuthHeaders } from '@/lib/lucid-l2/admin-auth'

const L2_TIMEOUT_MS = 15_000

class L2HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'L2HttpError'
  }
}

function buildL2Url(runtime: DedicatedRuntime, path: string): string {
  const l2Base = getL2BaseUrl()
  if (!l2Base) {
    throw new Error('L2 Gateway not configured')
  }
  if (!runtime.l2PassportId) {
    throw new Error('Managed runtime passport is missing')
  }
  return `${l2Base}/v1/agents/${encodeURIComponent(runtime.l2PassportId)}/${path}`
}

async function callL2(
  runtime: DedicatedRuntime,
  path: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(buildL2Url(runtime, path), {
    method,
    headers: {
      ...getL2AdminAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(L2_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new L2HttpError(detail || `L2 returned ${response.status}`, response.status)
  }

  return await response.json()
}

function buildControlPlaneRef(runtime: DedicatedRuntime): Record<string, unknown> {
  return {
    provider: runtime.provider,
    providerDeploymentId: runtime.l2DeploymentId,
    deploymentUrl: runtime.deploymentUrl,
  }
}

async function reconcileRuntimeEnv(
  runtime: DedicatedRuntime,
  envVars: Record<string, string> | undefined,
): Promise<{ status: 'updated' | 'unsupported' | 'skipped' }> {
  if (!envVars || Object.keys(envVars).length === 0) {
    return { status: 'skipped' }
  }

  try {
    await callL2(runtime, 'env', 'PUT', {
      vars: envVars,
      controlPlaneRef: buildControlPlaneRef(runtime),
    })
    return { status: 'updated' }
  } catch (error) {
    if (error instanceof L2HttpError && (error.status === 404 || error.status === 501)) {
      return { status: 'unsupported' }
    }
    throw error
  }
}

export const l2RuntimeMaintenanceProvider: RuntimeMaintenanceProvider = {
  name: 'l2',

  supports(runtime: DedicatedRuntime, request: RuntimeMaintenanceRequest): boolean {
    if (!runtime.managedByLucid || !runtime.l2PassportId) return false
    if (
      request.action !== 'reconcile' &&
      request.action !== 'redeploy' &&
      request.action !== 'restart' &&
      request.action !== 'rehome'
    ) return false
    return true
  },

  async execute(
    runtime: DedicatedRuntime,
    request: RuntimeMaintenanceRequest,
  ): Promise<RuntimeMaintenanceResult> {
    if (!this.supports(runtime, request)) {
      throw new Error(`Maintenance action ${request.action} is not supported for this runtime`)
    }
    if (request.action === 'rehome') {
      throw new Error('Re-home is orchestrated by the runtime maintenance service')
    }

    const envSync = await reconcileRuntimeEnv(runtime, request.envVars)
    if (request.action === 'reconcile') {
      return {
        success: envSync.status !== 'unsupported',
        action: request.action,
        provider: runtime.provider,
        deploymentId: runtime.l2DeploymentId,
        operationId: null,
        status: 'succeeded',
        url: runtime.deploymentUrl,
        detail: { envSync },
      }
    }

    let directRailwayDeploy: Awaited<ReturnType<typeof deployRailwayServiceFromCurrentSource>> = null
    let directRailwayError: string | null = null

    if (
      request.action === 'redeploy' &&
      runtime.provider === 'railway' &&
      request.targetImageRef
    ) {
      try {
        directRailwayDeploy = await deployRailwayServiceFromCurrentSource(runtime, request.targetImageRef)
      } catch (error) {
        directRailwayError = error instanceof Error ? error.message : 'Unknown Railway deploy error'
      }
    }

    if (directRailwayDeploy) {
      return {
        success: true,
        action: request.action,
        provider: runtime.provider,
        deploymentId: runtime.l2DeploymentId,
        operationId: directRailwayDeploy.deploymentId,
        status: directRailwayDeploy.status === 'FAILED' ? 'failed' : 'queued',
        url: directRailwayDeploy.url,
        detail: {
          mode: 'railway-source-deploy',
          envSync,
          railway: directRailwayDeploy,
          railwayDirectError: null,
        },
      }
    }

    let payload: Record<string, unknown>
    try {
      payload = await callL2(runtime, 'redeploy', 'POST', {
        controlPlaneRef: buildControlPlaneRef(runtime),
        image: request.targetImageRef ?? undefined,
        imageDigest: request.targetImageDigest ?? undefined,
        targetImageRef: request.targetImageRef ?? undefined,
        targetImageDigest: request.targetImageDigest ?? undefined,
      })
    } catch (error) {
      if (directRailwayError) {
        const fallbackError = error instanceof Error ? error.message : 'Unknown L2 redeploy error'
        throw new Error(
          `Railway source deploy failed: ${directRailwayError}. L2 fallback failed: ${fallbackError}`,
        )
      }
      throw error
    }
    const resultPayload =
      payload.result && typeof payload.result === 'object' && !Array.isArray(payload.result)
        ? payload.result as Record<string, unknown>
        : payload
    const rawStatus = resultPayload.status as string | undefined
    const status: RuntimeMaintenanceResult['status'] =
      rawStatus === 'failed'
        ? 'failed'
        : rawStatus === 'running' || rawStatus === 'deploying'
          ? 'running'
          : rawStatus === 'succeeded'
            ? 'succeeded'
            : 'queued'

    return {
      success: Boolean(resultPayload.success ?? payload.success ?? true),
      action: request.action,
      provider: runtime.provider,
      deploymentId: (resultPayload.deployment_id as string | undefined) ?? runtime.l2DeploymentId,
      operationId: (resultPayload.operation_id as string | undefined) ?? null,
      status,
      url: (resultPayload.url as string | undefined) ?? runtime.deploymentUrl,
      detail: {
        ...payload,
        providerResult: resultPayload,
        envSync,
        railwayDirectError: directRailwayError,
      },
    }
  },
}
