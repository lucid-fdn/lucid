import 'server-only'

import {
  completeRuntimeMaintenanceJob,
  createRuntimeMaintenanceJob,
  failRuntimeMaintenanceJob,
  getRuntimeById,
  getRuntimeMaintenanceState,
  markRuntimeMaintenanceJobRunning,
  updateRuntimeImageTracking,
  updateRuntimeMaintenanceJobProgress,
  updateRuntimeApiKeyHash,
  updateRuntimeEnvSnapshot,
  updateRuntimeL2Deployment,
  updateRuntimeL2Status,
} from '@/lib/db/mission-control'
import type { RuntimeMaintenanceState } from '@/lib/mission-control/types'
import type { RuntimeMaintenanceRequest, RuntimeMaintenanceResult } from './types'
import { l2RuntimeMaintenanceProvider } from './providers/l2'
import { buildManagedRuntimeEnvVars } from '@/lib/runtimes/managed-env'
import { buildRuntimeEnvSnapshot } from '@/lib/runtimes/env-snapshot'
import { generateApiKey, hashApiKey } from '@/app/api/runtimes/_auth'
import { isL2DeployError, launchRuntimeViaL2 } from '@/app/api/runtimes/_deploy'

interface PerformRuntimeMaintenanceInput extends RuntimeMaintenanceRequest {
  runtimeId: string
  orgId: string
  requestedBy: string | null
}

type RuntimeMaintenanceOutcome =
  | { ok: true; result: RuntimeMaintenanceResult; state: RuntimeMaintenanceState | null }
  | { ok: false; status: number; error: string }

function getRuntimeMaintenanceProvider(request: RuntimeMaintenanceRequest) {
  if (
    request.action === 'reconcile' ||
    request.action === 'redeploy' ||
    request.action === 'restart' ||
    request.action === 'rehome'
  ) {
    return l2RuntimeMaintenanceProvider
  }
  return null
}

export async function getRuntimeMaintenanceOverview(
  runtimeId: string,
  orgId: string,
  limit = 10,
): Promise<RuntimeMaintenanceState | null> {
  return await getRuntimeMaintenanceState(runtimeId, orgId, limit)
}

export async function performRuntimeMaintenanceAction(
  input: PerformRuntimeMaintenanceInput,
): Promise<RuntimeMaintenanceOutcome> {
  const runtime = await getRuntimeById(input.runtimeId, input.orgId)
  if (!runtime) {
    return { ok: false, status: 404, error: 'Runtime not found' }
  }

  const provider = getRuntimeMaintenanceProvider(input)
  if (!provider) {
    return { ok: false, status: 409, error: `Maintenance action ${input.action} is not supported` }
  }

  if (!provider.supports(runtime, input)) {
    return {
      ok: false,
      status: 409,
      error: 'This runtime does not support the requested maintenance action',
    }
  }

  const persistedAction = input.action
  const job = await createRuntimeMaintenanceJob({
    runtimeId: runtime.id,
    orgId: input.orgId,
    provider: runtime.provider,
    action: persistedAction,
    requestedBy: input.requestedBy,
    targetImageRef: input.targetImageRef ?? null,
    targetImageDigest: input.targetImageDigest ?? null,
  })

  if (!job) {
    return { ok: false, status: 500, error: 'Failed to create maintenance job' }
  }

  await markRuntimeMaintenanceJobRunning(job.id, runtime.id)

  try {
    if (input.action === 'rehome') {
      const apiKey = generateApiKey(runtime.id)
      const keyHash = hashApiKey(apiKey)
      const envVars = {
        LUCID_RUNTIME_KEY: apiKey,
        ...buildManagedRuntimeEnvVars(runtime),
      }
      const launch = await launchRuntimeViaL2({
        runtimeId: runtime.id,
        orgId: input.orgId,
        provider: runtime.provider,
        displayName: runtime.displayName,
        engine: runtime.engine,
        runtimeFlavor: runtime.runtimeFlavor ?? 'c1_managed',
        channelOwnership: runtime.channelOwnership,
        dedicatedTransportMode: runtime.dedicatedTransportMode,
        runtimeProtocol: runtime.runtimeProtocol,
        imageOverride: input.targetImageRef ?? null,
        envVars,
      })

      if (!launch) {
        throw new Error('Runtime re-home is not available for this provider')
      }
      if (isL2DeployError(launch)) {
        throw new Error(launch.error)
      }

      await updateRuntimeApiKeyHash(runtime.id, input.orgId, keyHash)
      await updateRuntimeL2Deployment(
        runtime.id,
        input.orgId,
        launch.result.deploymentId,
        launch.result.deploymentUrl || null,
        launch.result.passportId,
        {
          passportOwner: launch.result.passportOwner,
          ownerMode: launch.result.ownerMode,
          claimStatus: launch.result.claimStatus,
        },
      )
      await updateRuntimeEnvSnapshot(runtime.id, input.orgId, buildRuntimeEnvSnapshot(envVars))
      await updateRuntimeImageTracking(runtime.id, input.orgId, {
        currentImageRef: launch.image,
        targetImageRef: launch.image,
        lastSuccessfulImageRef: launch.image,
      })
      await updateRuntimeL2Status(runtime.id, 'rehome_queued', null)

      const result: RuntimeMaintenanceResult = {
        success: true,
        action: input.action,
        provider: runtime.provider,
        deploymentId: launch.result.deploymentId,
        operationId: launch.result.deploymentId,
        status: 'queued',
        url: launch.result.deploymentUrl || null,
        detail: {
          mode: 'l2-rehome',
          target: 'lucid-managed-runtime',
          passportOwnerMode: launch.result.ownerMode,
          envSync: { status: 'updated' },
        },
      }

      await completeRuntimeMaintenanceJob({
        jobId: job.id,
        runtimeId: runtime.id,
        orgId: input.orgId,
        action: persistedAction,
        providerOperationId: result.operationId ?? null,
        providerDeploymentId: result.deploymentId ?? null,
        targetImageRef: launch.image,
        targetImageDigest: input.targetImageDigest ?? null,
        resultPayload: result.detail,
      })

      return {
        ok: true,
        result,
        state: await getRuntimeMaintenanceState(runtime.id, input.orgId, 10),
      }
    }

    const envVars =
      (input.action === 'reconcile' || input.action === 'redeploy' || input.action === 'restart') &&
      runtime.managedByLucid
        ? buildManagedRuntimeEnvVars(runtime)
        : undefined
    const result = await provider.execute(runtime, {
      ...input,
      envVars,
    })

    if (result.deploymentId && result.deploymentId !== runtime.l2DeploymentId) {
      await updateRuntimeL2Deployment(
        runtime.id,
        input.orgId,
        result.deploymentId,
        result.url ?? runtime.deploymentUrl,
        runtime.l2PassportId,
      )
    }

    const envSyncStatus =
      (result.detail?.envSync as { status?: string } | undefined)?.status ?? null
    if (envVars && (envSyncStatus === 'updated' || envSyncStatus === 'skipped')) {
      await updateRuntimeEnvSnapshot(runtime.id, input.orgId, buildRuntimeEnvSnapshot(envVars))
    }

    if (input.action !== 'reconcile') {
      await updateRuntimeL2Status(runtime.id, result.status, null)
    }

    if (result.status === 'queued' || result.status === 'running') {
      await updateRuntimeMaintenanceJobProgress({
        jobId: job.id,
        runtimeId: runtime.id,
        orgId: input.orgId,
        action: persistedAction,
        providerOperationId: result.operationId ?? null,
        providerDeploymentId: result.deploymentId ?? null,
        targetImageRef: input.targetImageRef ?? null,
        targetImageDigest: input.targetImageDigest ?? null,
        resultPayload: result.detail,
      })
    } else {
      await completeRuntimeMaintenanceJob({
        jobId: job.id,
        runtimeId: runtime.id,
        orgId: input.orgId,
        action: persistedAction,
        providerOperationId: result.operationId ?? null,
        providerDeploymentId: result.deploymentId ?? null,
        targetImageRef: input.targetImageRef ?? null,
        targetImageDigest: input.targetImageDigest ?? null,
        resultPayload: result.detail,
      })
    }

    if (
      input.action === 'reconcile' &&
      input.targetImageRef &&
      result.status === 'succeeded'
    ) {
      await updateRuntimeImageTracking(runtime.id, input.orgId, {
        targetImageRef: input.targetImageRef,
      })
    }

    return {
      ok: true,
      result,
      state: await getRuntimeMaintenanceState(runtime.id, input.orgId, 10),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown maintenance error'
    if (input.action !== 'reconcile') {
      await updateRuntimeL2Status(runtime.id, 'failed', message)
    }
    await failRuntimeMaintenanceJob({
      jobId: job.id,
      runtimeId: runtime.id,
      orgId: input.orgId,
      action: persistedAction,
      errorMessage: message,
    })
    return { ok: false, status: 502, error: message }
  }
}
