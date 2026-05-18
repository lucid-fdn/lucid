import { describe, it, expect } from 'vitest'
import {
  agentEngineSchema,
  runtimeProviderSchema,
  runtimeStatusSchema,
  createRuntimeSchema,
  heartbeatSchema,
  runtimeEventSchema,
  runtimeEventsSchema,
  runtimeApprovalSchema,
  runtimeHealthScoreSchema,
  runtimeCostSchema,
} from '../schemas'
import { supportsRuntimeConfiguration } from '@lucid/runtime-compat'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('agentEngineSchema', () => {
  it.each(['openclaw', 'hermes', 'lucid'])('accepts valid engine: %s', (engine) => {
    expect(agentEngineSchema.safeParse(engine).success).toBe(true)
  })

  it('rejects unknown engines', () => {
    expect(agentEngineSchema.safeParse('nous').success).toBe(false)
  })
})

describe('runtimeProviderSchema', () => {
  it.each(['railway', 'akash', 'phala', 'io.net', 'nosana', 'docker', 'manual'])(
    'accepts valid provider: %s',
    (provider) => {
      expect(runtimeProviderSchema.safeParse(provider).success).toBe(true)
    }
  )

  it('rejects invalid provider', () => {
    expect(runtimeProviderSchema.safeParse('aws').success).toBe(false)
    expect(runtimeProviderSchema.safeParse('').success).toBe(false)
  })
})

describe('runtimeStatusSchema', () => {
  it.each(['pending', 'deploying', 'connected', 'stale', 'offline', 'failed', 'revoked'])(
    'accepts valid status: %s',
    (status) => {
      expect(runtimeStatusSchema.safeParse(status).success).toBe(true)
    }
  )

  it('rejects invalid status', () => {
    expect(runtimeStatusSchema.safeParse('running').success).toBe(false)
  })
})

describe('createRuntimeSchema', () => {
  it('validates correct input', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'prod-worker',
      provider: 'railway',
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional description and credentials', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'gpu-worker',
      description: 'GPU inference runtime on Akash',
      provider: 'akash',
      engine: 'hermes',
      runtimeFlavor: 'c2a_autonomous',
      channelOwnership: 'lucid_relay',
      providerCredentials: { apiKey: 'xxx', region: 'us-west' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts runtimeBootstrapConfig for Hermes migration', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'hermes-worker',
      provider: 'manual',
      engine: 'hermes',
      runtimeFlavor: 'c2a_autonomous',
      channelOwnership: 'lucid_relay',
      runtimeBootstrapConfig: {
        migration: {
          source: 'openclaw',
          hermesOpenClaw: {
            preset: 'user-data',
            dryRun: true,
          },
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts native channel mode only with native_pulse transport', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'openclaw-native',
      provider: 'manual',
      engine: 'openclaw',
      runtimeFlavor: 'c2a_autonomous',
      channelMode: 'native',
      channelOwnership: 'runtime_native',
      dedicatedTransportMode: 'native_pulse',
    })
    expect(result.success).toBe(true)
  })

  it('rejects relay transport when channelMode is native', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'broken-native',
      provider: 'manual',
      engine: 'openclaw',
      runtimeFlavor: 'c2a_autonomous',
      channelMode: 'native',
      channelOwnership: 'runtime_native',
      dedicatedTransportMode: 'relay',
    })
    expect(result.success).toBe(false)
  })

  it('rejects duplicate migration declarations', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'hermes-worker',
      provider: 'manual',
      engine: 'hermes',
      migration: { source: 'openclaw' },
      runtimeBootstrapConfig: { migration: { source: 'openclaw' } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty displayName', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: '',
      provider: 'railway',
    })
    expect(result.success).toBe(false)
  })

  it('rejects displayName over 100 chars', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'x'.repeat(101),
      provider: 'railway',
    })
    expect(result.success).toBe(false)
  })

  it('rejects description over 500 chars', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'ok',
      provider: 'docker',
      description: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid provider', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'test',
      provider: 'kubernetes',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing provider', () => {
    const result = createRuntimeSchema.safeParse({ displayName: 'test' })
    expect(result.success).toBe(false)
  })
})

describe('supportsRuntimeConfiguration', () => {
  it('allows Hermes C1 with Lucid relay or runtime-native ownership', () => {
    expect(supportsRuntimeConfiguration('hermes', 'c1_managed', 'lucid_relay')).toBe(true)
    expect(supportsRuntimeConfiguration('hermes', 'c1_managed', 'runtime_native')).toBe(true)
  })

  it('allows Hermes C2a with Lucid relay or runtime-native ownership', () => {
    expect(supportsRuntimeConfiguration('hermes', 'c2a_autonomous', 'lucid_relay')).toBe(true)
    expect(supportsRuntimeConfiguration('hermes', 'c2a_autonomous', 'runtime_native')).toBe(true)
  })

  it('allows Hermes shared with Lucid relay ownership', () => {
    expect(supportsRuntimeConfiguration('hermes', 'shared', 'lucid_relay')).toBe(true)
    expect(supportsRuntimeConfiguration('hermes', 'shared', 'runtime_native')).toBe(false)
  })
})

describe('heartbeatSchema', () => {
  const validHeartbeat = {
    runtimeId: VALID_UUID,
    generation: 1,
    cpuPercent: 45.2,
    ramPercent: 60.0,
    diskPercent: 30.5,
    pendingEvents: 0,
    deadLetters: 0,
    runtimeVersion: '2.4.0',
    agentCount: 3,
    uptimeSeconds: 86400,
  }

  it('validates correct input', () => {
    const result = heartbeatSchema.safeParse(validHeartbeat)
    expect(result.success).toBe(true)
  })

  it('accepts optional gpuPercent', () => {
    const result = heartbeatSchema.safeParse({ ...validHeartbeat, gpuPercent: 12.5 })
    expect(result.success).toBe(true)
  })

  it('accepts generic runtime metadata alongside legacy version field', () => {
    const result = heartbeatSchema.safeParse({
      ...validHeartbeat,
      engine: 'hermes',
      runtimeProtocol: 'lucid-runtime-v2',
      engineVersion: '0.1.0',
      runtimeVersion: 'bridge/0.1.0',
      openclawVersion: 'legacy/2.4.0',
    })
    expect(result.success).toBe(true)
  })

  it('accepts legacy openclawVersion without runtimeVersion', () => {
    const result = heartbeatSchema.safeParse({
      ...validHeartbeat,
      runtimeVersion: undefined,
      openclawVersion: '2.4.0',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing runtimeId', () => {
    const { runtimeId, ...rest } = validHeartbeat
    expect(heartbeatSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects non-UUID runtimeId', () => {
    expect(heartbeatSchema.safeParse({ ...validHeartbeat, runtimeId: 'abc' }).success).toBe(false)
  })

  it('rejects cpuPercent > 100', () => {
    expect(heartbeatSchema.safeParse({ ...validHeartbeat, cpuPercent: 101 }).success).toBe(false)
  })

  it('rejects cpuPercent < 0', () => {
    expect(heartbeatSchema.safeParse({ ...validHeartbeat, cpuPercent: -1 }).success).toBe(false)
  })

  it('rejects negative pendingEvents', () => {
    expect(heartbeatSchema.safeParse({ ...validHeartbeat, pendingEvents: -1 }).success).toBe(false)
  })

  it('rejects generation < 1', () => {
    expect(heartbeatSchema.safeParse({ ...validHeartbeat, generation: 0 }).success).toBe(false)
  })

  it('rejects fractional agentCount', () => {
    expect(heartbeatSchema.safeParse({ ...validHeartbeat, agentCount: 1.5 }).success).toBe(false)
  })

  it('rejects heartbeat missing both runtimeVersion and openclawVersion', () => {
    expect(
      heartbeatSchema.safeParse({ ...validHeartbeat, runtimeVersion: undefined }).success
    ).toBe(false)
  })
})

describe('runtimeEventSchema', () => {
  it('validates correct event', () => {
    const result = runtimeEventSchema.safeParse({
      eventType: 'tool_call',
      payload: { tool_name: 'get_price', args: {} },
    })
    expect(result.success).toBe(true)
  })

  it('defaults severity to info', () => {
    const result = runtimeEventSchema.parse({ eventType: 'tool_call' })
    expect(result.severity).toBe('info')
  })

  it('defaults payload to empty object', () => {
    const result = runtimeEventSchema.parse({ eventType: 'error' })
    expect(result.payload).toEqual({})
  })

  it('accepts optional agentId', () => {
    const result = runtimeEventSchema.safeParse({
      agentId: VALID_UUID,
      eventType: 'run_started',
    })
    expect(result.success).toBe(true)
  })

  it('accepts runtime migration lifecycle events', () => {
    expect(runtimeEventSchema.safeParse({ eventType: 'runtime_migration_started' }).success).toBe(true)
    expect(runtimeEventSchema.safeParse({ eventType: 'runtime_migration_completed' }).success).toBe(true)
    expect(runtimeEventSchema.safeParse({ eventType: 'runtime_migration_failed' }).success).toBe(true)
  })

  it('accepts native mutation candidate events', () => {
    expect(runtimeEventSchema.safeParse({ eventType: 'native_mutation_candidate' }).success).toBe(true)
  })

  it('rejects invalid eventType', () => {
    expect(runtimeEventSchema.safeParse({ eventType: 'unknown_event' }).success).toBe(false)
  })

  it('rejects invalid severity', () => {
    expect(
      runtimeEventSchema.safeParse({ eventType: 'error', severity: 'fatal' }).success
    ).toBe(false)
  })

  it.each([
    'tool_call', 'tool_result', 'native_mutation_candidate', 'error',
    'message_received', 'message_sent',
    'run_started', 'run_finished',
    'channel_connected', 'channel_disconnected', 'channel_deactivated',
  ])(
    'accepts valid event type: %s',
    (eventType) => {
      expect(runtimeEventSchema.safeParse({ eventType }).success).toBe(true)
    }
  )
})

describe('runtimeEventsSchema', () => {
  it('validates batch of events', () => {
    const result = runtimeEventsSchema.safeParse({
      events: [
        { eventType: 'tool_call', payload: { tool: 'get_price' } },
        { eventType: 'tool_result', severity: 'info' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty events array', () => {
    const result = runtimeEventsSchema.safeParse({ events: [] })
    expect(result.success).toBe(true)
  })

  it('rejects batch > 100 events', () => {
    const events = Array.from({ length: 101 }, () => ({ eventType: 'tool_call' }))
    expect(runtimeEventsSchema.safeParse({ events }).success).toBe(false)
  })

  it('accepts exactly 100 events', () => {
    const events = Array.from({ length: 100 }, () => ({ eventType: 'tool_call' }))
    expect(runtimeEventsSchema.safeParse({ events }).success).toBe(true)
  })
})

describe('runtimeApprovalSchema', () => {
  const validApproval = {
    agentId: VALID_UUID,
    toolName: 'dex_swap',
    toolArgs: { amount: 100, token: 'SOL' },
    runId: 'run-abc-123',
  }

  it('validates correct input', () => {
    const result = runtimeApprovalSchema.safeParse(validApproval)
    expect(result.success).toBe(true)
  })

  it('defaults timeoutMs to 300000 (5 min)', () => {
    const result = runtimeApprovalSchema.parse(validApproval)
    expect(result.timeoutMs).toBe(300_000)
  })

  it('accepts custom timeoutMs', () => {
    const result = runtimeApprovalSchema.parse({ ...validApproval, timeoutMs: 60_000 })
    expect(result.timeoutMs).toBe(60_000)
  })

  it('rejects timeoutMs < 1000', () => {
    expect(
      runtimeApprovalSchema.safeParse({ ...validApproval, timeoutMs: 500 }).success
    ).toBe(false)
  })

  it('rejects timeoutMs > 600000', () => {
    expect(
      runtimeApprovalSchema.safeParse({ ...validApproval, timeoutMs: 700_000 }).success
    ).toBe(false)
  })

  it('rejects missing agentId', () => {
    const { agentId, ...rest } = validApproval
    expect(runtimeApprovalSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects non-UUID agentId', () => {
    expect(
      runtimeApprovalSchema.safeParse({ ...validApproval, agentId: 'not-uuid' }).success
    ).toBe(false)
  })
})

describe('runtimeHealthScoreSchema', () => {
  it('validates correct input', () => {
    const result = runtimeHealthScoreSchema.safeParse({
      agentId: VALID_UUID,
      overallScore: 85,
      dimensions: { latency: 90, error_rate: 80, memory_health: 75 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects overallScore > 100', () => {
    expect(
      runtimeHealthScoreSchema.safeParse({
        agentId: VALID_UUID,
        overallScore: 101,
        dimensions: {},
      }).success
    ).toBe(false)
  })

  it('rejects overallScore < 0', () => {
    expect(
      runtimeHealthScoreSchema.safeParse({
        agentId: VALID_UUID,
        overallScore: -1,
        dimensions: {},
      }).success
    ).toBe(false)
  })

  it('rejects dimension values > 100', () => {
    expect(
      runtimeHealthScoreSchema.safeParse({
        agentId: VALID_UUID,
        overallScore: 50,
        dimensions: { latency: 150 },
      }).success
    ).toBe(false)
  })
})

describe('runtimeCostSchema', () => {
  it('validates correct input', () => {
    const result = runtimeCostSchema.safeParse({
      agentId: VALID_UUID,
      runId: 'run-123',
      inputTokens: 1500,
      outputTokens: 800,
      estimatedCostUsd: 0.045,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative inputTokens', () => {
    expect(
      runtimeCostSchema.safeParse({
        agentId: VALID_UUID,
        runId: 'run-123',
        inputTokens: -1,
        outputTokens: 0,
        estimatedCostUsd: 0,
      }).success
    ).toBe(false)
  })

  it('rejects negative estimatedCostUsd', () => {
    expect(
      runtimeCostSchema.safeParse({
        agentId: VALID_UUID,
        runId: 'run-123',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: -0.01,
      }).success
    ).toBe(false)
  })

  it('accepts zero values', () => {
    const result = runtimeCostSchema.safeParse({
      agentId: VALID_UUID,
      runId: 'run-000',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    })
    expect(result.success).toBe(true)
  })
})
