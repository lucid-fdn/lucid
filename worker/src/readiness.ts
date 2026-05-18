import type { RuntimeAdapterReadiness } from './runtime-adapters/types.js'

export interface WorkerReadinessState {
  adapterId: string
  workerRole?: string
  readiness: RuntimeAdapterReadiness
}

export function buildWorkerReadinessState(adapterId: string, workerRole?: string): WorkerReadinessState {
  return {
    adapterId,
    workerRole,
    readiness: {
      ready: false,
      required: true,
      status: 'unavailable',
      error: null,
    },
  }
}

export function buildReadinessResponse(state: WorkerReadinessState): {
  statusCode: number
  body: Record<string, unknown>
} {
  const readinessDetails = state.readiness.details

  if (!state.readiness.required || state.readiness.ready) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        status: 'ready',
        worker: {
          role: state.workerRole ?? 'all',
        },
        runtime: {
        adapter: state.adapterId,
        ready: true,
        required: state.readiness.required,
        status: state.readiness.status,
        ...(readinessDetails ? { details: readinessDetails } : {}),
      },
    },
  }
  }

  return {
    statusCode: 503,
    body: {
      ok: false,
      status: 'starting',
      worker: {
        role: state.workerRole ?? 'all',
      },
      runtime: {
        adapter: state.adapterId,
        ready: false,
        required: state.readiness.required,
        status: state.readiness.status,
        error: state.readiness.error,
        ...(readinessDetails ? { details: readinessDetails } : {}),
      },
    },
  }
}
