import { describe, expect, it } from 'vitest'
import {
  buildReadinessResponse,
  buildWorkerReadinessState,
} from '../readiness.js'
import { getWorkerRuntimeAdapter } from '../runtime-adapters/index.js'

describe('worker readiness', () => {
  it('uses the shared-worker adapter on shared workers', () => {
    const adapter = getWorkerRuntimeAdapter({
      LUCID_RUNTIME_ID: undefined,
      LUCID_ENGINE: 'openclaw',
    } as const)
    expect(adapter.id).toBe('shared-worker')
  })

  it('returns 200 when the active runtime adapter is skipped', () => {
    const state = buildWorkerReadinessState('openclaw')
    state.readiness = {
      ready: true,
      required: false,
      status: 'skipped',
    }

    const response = buildReadinessResponse(state)
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      status: 'ready',
      worker: {
        role: 'all',
      },
      runtime: {
        adapter: 'openclaw',
        ready: true,
        required: false,
        status: 'skipped',
      },
      worker: {
        role: 'all',
      },
    })
  })

  it('returns 503 when Hermes is required but unavailable', () => {
    const response = buildReadinessResponse({
      adapterId: 'hermes',
      readiness: {
        ready: false,
        required: true,
        status: 'unavailable',
        error: 'spawn hermes ENOENT',
      },
    })

    expect(response.statusCode).toBe(503)
    expect(response.body).toEqual({
      ok: false,
      status: 'starting',
      worker: {
        role: 'all',
      },
      runtime: {
        adapter: 'hermes',
        ready: false,
        required: true,
        status: 'unavailable',
        error: 'spawn hermes ENOENT',
      },
      worker: {
        role: 'all',
      },
    })
  })
})
