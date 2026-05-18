import type { DedicatedRuntime, RuntimeMaintenanceState } from './types'

const MANAGED_RUNTIME_DIAGNOSTIC_MESSAGE =
  'Lucid provider diagnostics are being reviewed by Lucid operators.'

function sanitizeManagedRuntimeServices(runtime: DedicatedRuntime): DedicatedRuntime['runtimeServices'] {
  return (runtime.runtimeServices ?? []).map((service) => ({
    serviceName: service.serviceName,
    label: service.label ?? service.serviceName,
    description: service.description ?? null,
    status: service.status,
    lifecycle: service.lifecycle ?? null,
    healthStatus: service.healthStatus,
    externallyVisible: false,
    metadata: {},
  }))
}

function sanitizeManagedAdapterProbe(runtime: DedicatedRuntime): DedicatedRuntime['adapterProbe'] {
  if (!runtime.adapterProbe) return null
  return {
    adapterType: runtime.adapterProbe.adapterType,
    status: runtime.adapterProbe.status,
    target: null,
    checks: (runtime.adapterProbe.checks ?? []).map((check) => ({
      code: check.code,
      level: check.level,
      message: check.message,
      hint: check.hint ?? null,
      targetKind: check.targetKind ?? null,
    })),
    testedAt: runtime.adapterProbe.testedAt ?? null,
    expiresAt: runtime.adapterProbe.expiresAt ?? null,
    cached: runtime.adapterProbe.cached ?? true,
    source: runtime.adapterProbe.source ?? 'heartbeat',
  }
}

export function sanitizeRuntimeForClient(runtime: DedicatedRuntime): DedicatedRuntime {
  const isLucidOperated =
    runtime.managedByLucid || runtime.runtimeTier === 'dedicated'

  return {
    ...runtime,
    provider: isLucidOperated ? 'manual' : runtime.provider,
    deploymentUrl: isLucidOperated ? null : runtime.deploymentUrl,
    l2DeploymentId: isLucidOperated ? null : runtime.l2DeploymentId,
    l2PassportId: isLucidOperated ? null : runtime.l2PassportId,
    lastL2Status: isLucidOperated
      ? runtime.lastL2Status === 'operator_action_required'
        ? 'operator_action_required'
        : null
      : runtime.lastL2Status,
    lastL2Error: isLucidOperated ? null : runtime.lastL2Error,
    envSnapshot: null,
    currentImageRef: isLucidOperated ? null : runtime.currentImageRef,
    currentImageDigest: isLucidOperated ? null : runtime.currentImageDigest,
    targetImageRef: isLucidOperated ? null : runtime.targetImageRef,
    lastSuccessfulImageRef: isLucidOperated ? null : runtime.lastSuccessfulImageRef,
    adapterIdentity: isLucidOperated && runtime.adapterIdentity
      ? {
          adapterType: runtime.adapterIdentity.adapterType,
          label: runtime.adapterIdentity.label,
          version: runtime.adapterIdentity.version,
          source: 'builtin',
          executionTargets: runtime.adapterIdentity.executionTargets ?? [],
          managedBy: 'lucid',
          protocolVersion: runtime.adapterIdentity.protocolVersion ?? 'runtime-capability-v1',
          metadata: {},
        }
      : runtime.adapterIdentity,
    runtimeServices: isLucidOperated
      ? sanitizeManagedRuntimeServices(runtime)
      : runtime.runtimeServices,
    adapterProbe: isLucidOperated
      ? sanitizeManagedAdapterProbe(runtime)
      : runtime.adapterProbe,
    commandSpec: isLucidOperated ? null : runtime.commandSpec,
  }
}

export function sanitizeRuntimeMaintenanceStateForClient(
  state: RuntimeMaintenanceState,
): RuntimeMaintenanceState {
  if (!state.managedByLucid) return state

  return {
    ...state,
    currentImageRef: null,
    currentImageDigest: null,
    targetImageRef: null,
    lastSuccessfulImageRef: null,
    lastMaintenanceError: state.lastMaintenanceError
      ? MANAGED_RUNTIME_DIAGNOSTIC_MESSAGE
      : null,
    jobs: state.jobs.map((job) => ({
      ...job,
      targetImageRef: null,
      targetImageDigest: null,
      providerOperationId: null,
      providerDeploymentId: null,
      resultPayload: {},
      error: job.error ? MANAGED_RUNTIME_DIAGNOSTIC_MESSAGE : null,
    })),
  }
}
