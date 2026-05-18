import { describe, it, expect } from 'vitest'
import { detectRuntimeIssues, detectFleetIssues, countIssues } from '../issue-detector'
import type { DedicatedRuntime } from '../types'

function makeRuntime(overrides: Partial<DedicatedRuntime> = {}): DedicatedRuntime {
  return {
    id: 'rt-1',
    displayName: 'Test Runtime',
    description: null,
    provider: 'railway',
    status: 'connected',
    runtimeTier: 'dedicated',
    lastSeenAt: new Date().toISOString(),
    openclawVersion: '1.0.0',
    cpuPercent: 30,
    ramPercent: 40,
    diskPercent: 50,
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
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('detectRuntimeIssues', () => {
  it('returns no issues for a healthy runtime', () => {
    const issues = detectRuntimeIssues(makeRuntime())
    expect(issues).toHaveLength(0)
  })

  it('detects offline runtime', () => {
    const issues = detectRuntimeIssues(makeRuntime({
      lastSeenAt: new Date(Date.now() - 600_000).toISOString(), // 10 min ago
    }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('critical')
    expect(issues[0].title).toBe('Runtime offline')
  })

  it('detects stale heartbeat', () => {
    const issues = detectRuntimeIssues(makeRuntime({
      lastSeenAt: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
    }))
    expect(issues.some((i) => i.title === 'Heartbeat stale')).toBe(true)
  })

  it('detects high CPU warning (aligned with visual: > 60%)', () => {
    const issues = detectRuntimeIssues(makeRuntime({ cpuPercent: 65 }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].title).toBe('CPU usage elevated')
  })

  it('detects critical CPU (aligned with visual: > 80%)', () => {
    const issues = detectRuntimeIssues(makeRuntime({ cpuPercent: 85 }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('critical')
    expect(issues[0].title).toBe('CPU usage critical')
  })

  it('detects high RAM', () => {
    const issues = detectRuntimeIssues(makeRuntime({ ramPercent: 85 }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('critical')
  })

  it('detects disk pressure', () => {
    const issues = detectRuntimeIssues(makeRuntime({ diskPercent: 85 }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('critical')
    expect(issues[0].title).toBe('Disk usage critical')
  })

  it('returns no issues for null metrics', () => {
    const issues = detectRuntimeIssues(makeRuntime({ cpuPercent: null, ramPercent: null, diskPercent: null }))
    expect(issues).toHaveLength(0)
  })

  it('detects GPU critical', () => {
    const issues = detectRuntimeIssues(makeRuntime({ gpuPercent: 90 }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('critical')
    expect(issues[0].title).toBe('GPU usage critical')
  })

  it('detects queue backlog warning', () => {
    const issues = detectRuntimeIssues(makeRuntime({ workerPendingEvents: 150 }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].title).toBe('Event queue growing')
  })

  it('detects queue backlog critical', () => {
    const issues = detectRuntimeIssues(makeRuntime({ workerPendingEvents: 600 }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('critical')
  })

  it('detects dead letters', () => {
    const issues = detectRuntimeIssues(makeRuntime({ workerDeadLetters: 3 }))
    expect(issues.some((i) => i.title === 'Dead letters present')).toBe(true)
  })

  it('detects dead letters critical', () => {
    const issues = detectRuntimeIssues(makeRuntime({ workerDeadLetters: 15 }))
    expect(issues.some((i) => i.severity === 'critical' && i.metric === 'deadLetters')).toBe(true)
  })

  it('detects native channel errors', () => {
    const issues = detectRuntimeIssues(makeRuntime({
      nativeChannels: [
        { channelType: 'telegram', accountId: '123', status: 'error', errorMessage: 'Bot token expired' },
        { channelType: 'discord', accountId: '456', status: 'connected' },
      ],
    }))
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toContain('1 channel')
    expect(issues[0].description).toContain('Bot token expired')
  })

  it('combines multiple issues', () => {
    const issues = detectRuntimeIssues(makeRuntime({
      cpuPercent: 85,
      ramPercent: 85,
      workerDeadLetters: 5,
    }))
    expect(issues.length).toBe(3)
  })

  it('skips metric checks for offline runtimes', () => {
    const issues = detectRuntimeIssues(makeRuntime({
      lastSeenAt: new Date(Date.now() - 600_000).toISOString(),
      cpuPercent: 99, // should be ignored
    }))
    // Only offline issue, not CPU
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toBe('Runtime offline')
  })
})

describe('detectFleetIssues', () => {
  it('aggregates issues across runtimes', () => {
    const runtimes = [
      makeRuntime({ id: 'rt-1', cpuPercent: 95 }),
      makeRuntime({ id: 'rt-2', diskPercent: 96 }),
      makeRuntime({ id: 'rt-3' }), // healthy
    ]
    const issues = detectFleetIssues(runtimes)
    expect(issues).toHaveLength(2)
  })
})

describe('countIssues', () => {
  it('counts warnings and criticals', () => {
    const issues = detectRuntimeIssues(makeRuntime({
      cpuPercent: 65, // warning (> 60)
      diskPercent: 85, // critical (> 80)
    }))
    const counts = countIssues(issues)
    expect(counts.warnings).toBe(1)
    expect(counts.criticals).toBe(1)
  })
})
