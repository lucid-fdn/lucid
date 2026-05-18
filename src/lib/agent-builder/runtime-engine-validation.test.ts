import { describe, expect, it } from 'vitest'

import { validateRuntimeEngineSetup } from '@/lib/agent-builder/runtime-engine-validation'
import type { DedicatedRuntime } from '@/lib/mission-control/types'

const runtime: DedicatedRuntime = {
  id: '00000000-0000-4000-8000-000000000001',
  orgId: 'org-1',
  displayName: 'BYO dev box',
  description: null,
  engine: 'openclaw',
  provider: 'manual',
  status: 'connected',
  runtimeTier: 'byo',
  runtimeFlavor: 'c2a_autonomous',
  channelOwnership: 'runtime_native',
  runtimeProtocol: 'lucid-runtime-v1',
  lastSeenAt: '2026-05-04T10:00:00.000Z',
  openclawVersion: null,
  engineVersion: '1.0.0',
  runtimeVersion: '1.0.0',
  cpuPercent: null,
  ramPercent: null,
  diskPercent: null,
  gpuPercent: null,
  workerPendingEvents: 0,
  workerDeadLetters: 0,
  agentCount: 1,
  deploymentUrl: null,
  l2DeploymentId: null,
  l2PassportId: null,
  lastL2Status: null,
  lastL2Error: null,
  lastL2CheckedAt: null,
  managedByLucid: false,
  maintenanceChannel: 'stable',
  autoUpdatePolicy: 'security_auto',
  currentImageRef: 'lucid/runtime:1',
  currentImageDigest: null,
  targetImageRef: null,
  lastSuccessfulImageRef: null,
  lastMaintenanceAction: null,
  lastMaintenanceAt: null,
  lastMaintenanceError: null,
  createdAt: '2026-05-04T09:00:00.000Z',
}

describe('validateRuntimeEngineSetup', () => {
  it('accepts default shared OpenClaw setup', () => {
    const result = validateRuntimeEngineSetup({
      runtime: { mode: 'shared', engine: 'openclaw' },
    })

    expect(result.status).toBe('ready')
    expect(result.blockingIssues).toHaveLength(0)
    expect(result.summary).toBe('Lucid Cloud - OpenClaw - Shared')
  })

  it('blocks BYO without a selected runtime', () => {
    const result = validateRuntimeEngineSetup({
      runtime: { mode: 'byo', engine: 'openclaw', channel_ownership: 'runtime_native' },
    })

    expect(result.status).toBe('needs-runtime')
    expect(result.blockingIssues[0]?.message).toContain('BYO runtime is selected')
  })

  it('blocks engine/runtime mismatch', () => {
    const result = validateRuntimeEngineSetup({
      runtime: {
        mode: 'byo',
        engine: 'hermes',
        runtime_id: runtime.id,
        channel_ownership: 'runtime_native',
      },
      runtimes: [runtime],
    })

    expect(result.blockingIssues.some((issue) => issue.code === 'runtime-engine-mismatch')).toBe(true)
  })

  it('accepts matching BYO runtime native setup', () => {
    const result = validateRuntimeEngineSetup({
      runtime: {
        mode: 'byo',
        engine: 'openclaw',
        runtime_id: runtime.id,
        channel_ownership: 'runtime_native',
      },
      runtimes: [runtime],
    })

    expect(result.status).toBe('ready')
    expect(result.blockingIssues).toHaveLength(0)
  })
})
