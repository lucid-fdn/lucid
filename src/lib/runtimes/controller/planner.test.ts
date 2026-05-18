import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { DedicatedRuntime, RuntimeMaintenanceState } from '@/lib/mission-control/types'
import {
  planManagedRuntimeSync,
  resolveDesiredRuntimeImageRef,
  shouldAutoRedeployRuntime,
} from './planner'

function makeRuntime(overrides: Partial<DedicatedRuntime> = {}): DedicatedRuntime {
  return {
    id: 'rt-1',
    orgId: 'org-1',
    displayName: 'Runtime 1',
    description: null,
    engine: 'openclaw',
    provider: 'railway',
    status: 'connected',
    runtimeTier: 'dedicated',
    runtimeFlavor: 'c1_managed',
    channelOwnership: 'lucid_relay',
    runtimeProtocol: 'lucid-runtime-v2',
    lastSeenAt: null,
    openclawVersion: null,
    engineVersion: null,
    runtimeVersion: null,
    cpuPercent: null,
    ramPercent: null,
    diskPercent: null,
    gpuPercent: null,
    workerPendingEvents: 0,
    workerDeadLetters: 0,
    agentCount: 1,
    deploymentUrl: null,
    l2DeploymentId: 'dep-1',
    l2PassportId: 'pass-1',
    lastL2Status: null,
    lastL2Error: null,
    lastL2CheckedAt: null,
    managedByLucid: true,
    maintenanceChannel: 'stable',
    autoUpdatePolicy: 'full_auto',
    currentImageRef: 'ghcr.io/daishizensensei/worker:old',
    currentImageDigest: null,
    targetImageRef: 'ghcr.io/daishizensensei/worker:old',
    lastSuccessfulImageRef: 'ghcr.io/daishizensensei/worker:old',
    lastMaintenanceAction: null,
    lastMaintenanceAt: null,
    lastMaintenanceError: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    ...overrides,
  }
}

function makeState(jobs: RuntimeMaintenanceState['jobs'] = []): RuntimeMaintenanceState {
  return {
    runtimeId: 'rt-1',
    managedByLucid: true,
    maintenanceChannel: 'stable',
    autoUpdatePolicy: 'full_auto',
    currentImageRef: 'ghcr.io/daishizensensei/worker:old',
    currentImageDigest: null,
    targetImageRef: 'ghcr.io/daishizensensei/worker:old',
    lastSuccessfulImageRef: 'ghcr.io/daishizensensei/worker:old',
    lastMaintenanceAction: null,
    lastMaintenanceAt: null,
    lastMaintenanceError: null,
    jobs,
  }
}

describe('managed runtime controller planner', () => {
  const originalHermesImage = process.env.LUCID_HERMES_IMAGE

  afterEach(() => {
    if (originalHermesImage === undefined) {
      delete process.env.LUCID_HERMES_IMAGE
    } else {
      process.env.LUCID_HERMES_IMAGE = originalHermesImage
    }
    vi.restoreAllMocks()
  })

  it('resolves the desired image for managed dedicated runtimes', () => {
    const desired = resolveDesiredRuntimeImageRef(makeRuntime())
    expect(desired).toBeTruthy()
  })

  it('does not resolve deprecated Hermes bootstrap tags as controller desired images', () => {
    process.env.LUCID_HERMES_IMAGE = 'ghcr.io/daishizensensei/worker:hermes-fix-20260415-5'

    const desired = resolveDesiredRuntimeImageRef(makeRuntime({ engine: 'hermes' }))
    expect(desired).toBeNull()
  })

  it('does not auto redeploy when policy is manual', () => {
    const runtime = makeRuntime({ autoUpdatePolicy: 'manual' })
    expect(
      shouldAutoRedeployRuntime(runtime, makeState(), 'ghcr.io/daishizensensei/worker:new'),
    ).toBe(false)
  })

  it('does not auto redeploy when desired image already matches target/current', () => {
    const runtime = makeRuntime({
      currentImageRef: 'ghcr.io/daishizensensei/worker:new',
      targetImageRef: 'ghcr.io/daishizensensei/worker:new',
    })
    expect(
      shouldAutoRedeployRuntime(runtime, makeState(), 'ghcr.io/daishizensensei/worker:new'),
    ).toBe(false)
  })

  it('does not auto redeploy when a maintenance job is already queued or running', () => {
    const runtime = makeRuntime()
    const state = makeState([
      {
        id: 'job-1',
        runtimeId: 'rt-1',
        orgId: 'org-1',
        provider: 'railway',
        action: 'redeploy',
        status: 'running',
        targetImageRef: 'ghcr.io/daishizensensei/worker:new',
        targetImageDigest: null,
        providerOperationId: null,
        providerDeploymentId: null,
        requestedBy: 'user-1',
        resultPayload: {},
        error: null,
        startedAt: '2026-04-14T12:00:00.000Z',
        completedAt: null,
        createdAt: '2026-04-14T12:00:00.000Z',
      },
    ])
    expect(
      shouldAutoRedeployRuntime(runtime, state, 'ghcr.io/daishizensensei/worker:new'),
    ).toBe(false)
  })

  it('does not immediately retry the same failed desired image inside cooldown', () => {
    const runtime = makeRuntime({
      targetImageRef: 'ghcr.io/daishizensensei/worker:new',
      lastMaintenanceError: 'boom',
      lastMaintenanceAt: new Date().toISOString(),
    })
    expect(
      shouldAutoRedeployRuntime(runtime, makeState(), 'ghcr.io/daishizensensei/worker:new'),
    ).toBe(false)
  })

  it('plans a redeploy when a managed runtime drifts from the desired image', () => {
    const runtime = makeRuntime()
    const plan = planManagedRuntimeSync({
      runtime,
      state: makeState(),
      desiredImageRef: 'ghcr.io/daishizensensei/worker:new',
      heartbeatStatus: 'connected',
    })
    expect(plan).toEqual({
      kind: 'redeploy',
      reason: 'image_drift',
      desiredImageRef: 'ghcr.io/daishizensensei/worker:new',
    })
  })

  it('plans image tracking finalization when target image has converged on heartbeat', () => {
    const runtime = makeRuntime({
      currentImageRef: 'ghcr.io/daishizensensei/worker:old',
      targetImageRef: 'ghcr.io/daishizensensei/worker:new',
    })
    const plan = planManagedRuntimeSync({
      runtime,
      state: makeState(),
      desiredImageRef: 'ghcr.io/daishizensensei/worker:new',
      heartbeatStatus: 'connected',
    })
    expect(plan).toEqual({
      kind: 'reconcile_image_tracking',
      reason: 'image_tracking_finalize',
      desiredImageRef: 'ghcr.io/daishizensensei/worker:new',
    })
  })
})
