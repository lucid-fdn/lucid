/**
 * Relay Schema Validation Tests
 *
 * Tests Zod schemas for claim-inbound and complete-inbound payloads,
 * including boundary conditions, UUID validation, and channel-specific metadata.
 */

import { describe, it, expect } from 'vitest'
import {
  claimInboundSchema,
  completeInboundSchema,
  heartbeatSchema,
  nativeChannelStatusSchema,
  governanceActionSchema,
} from '@/lib/mission-control/schemas'

// Valid v4 UUIDs
const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const VALID_UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'

describe('claimInboundSchema', () => {
  it('accepts valid batch size', () => {
    const result = claimInboundSchema.safeParse({ batchSize: 10 })
    expect(result.success).toBe(true)
    expect(result.data?.batchSize).toBe(10)
  })

  it('defaults batchSize to 10', () => {
    const result = claimInboundSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data?.batchSize).toBe(10)
  })

  it('rejects batchSize below minimum (0)', () => {
    const result = claimInboundSchema.safeParse({ batchSize: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects batchSize above maximum (51)', () => {
    const result = claimInboundSchema.safeParse({ batchSize: 51 })
    expect(result.success).toBe(false)
  })

  it('accepts boundary: batchSize=1', () => {
    const result = claimInboundSchema.safeParse({ batchSize: 1 })
    expect(result.success).toBe(true)
  })

  it('accepts boundary: batchSize=50', () => {
    const result = claimInboundSchema.safeParse({ batchSize: 50 })
    expect(result.success).toBe(true)
  })

  it('rejects non-integer batchSize', () => {
    const result = claimInboundSchema.safeParse({ batchSize: 10.5 })
    expect(result.success).toBe(false)
  })
})

describe('completeInboundSchema', () => {
  const validPayload = {
    eventId: VALID_UUID,
    runId: VALID_UUID_2,
    responseText: 'Hello from agent',
  }

  it('accepts minimal valid payload', () => {
    const result = completeInboundSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it('accepts payload with token usage', () => {
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
    })
    expect(result.success).toBe(true)
  })

  it('accepts payload with output artifacts', () => {
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      outputArtifacts: [
        { toolName: 'get_price', result: '{"price": 100}' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing eventId', () => {
    const result = completeInboundSchema.safeParse({
      runId: VALID_UUID_2,
      responseText: 'Hello',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing runId', () => {
    const result = completeInboundSchema.safeParse({
      eventId: VALID_UUID,
      responseText: 'Hello',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID eventId', () => {
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      eventId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty responseText', () => {
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      responseText: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects responseText exceeding 100K chars', () => {
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      responseText: 'x'.repeat(100_001),
    })
    expect(result.success).toBe(false)
  })

  it('accepts responseText at 100K boundary', () => {
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      responseText: 'x'.repeat(100_000),
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative token counts', () => {
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      tokenUsage: { inputTokens: -1, outputTokens: 50, estimatedCostUsd: 0 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects too many output artifacts (>50)', () => {
    const artifacts = Array.from({ length: 51 }, (_, i) => ({
      toolName: `tool_${i}`,
      result: 'ok',
    }))
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      outputArtifacts: artifacts,
    })
    expect(result.success).toBe(false)
  })

  it('accepts exactly 50 output artifacts', () => {
    const artifacts = Array.from({ length: 50 }, (_, i) => ({
      toolName: `tool_${i}`,
      result: 'ok',
    }))
    const result = completeInboundSchema.safeParse({
      ...validPayload,
      outputArtifacts: artifacts,
    })
    expect(result.success).toBe(true)
  })
})

describe('nativeChannelStatusSchema', () => {
  it('accepts valid connected status', () => {
    const result = nativeChannelStatusSchema.safeParse({
      channelType: 'telegram',
      accountId: 'bot123',
      status: 'connected',
    })
    expect(result.success).toBe(true)
  })

  it('accepts error status with errorMessage', () => {
    const result = nativeChannelStatusSchema.safeParse({
      channelType: 'discord',
      accountId: 'srv456',
      status: 'error',
      errorMessage: 'Token expired',
    })
    expect(result.success).toBe(true)
  })

  it('rejects error status without errorMessage', () => {
    const result = nativeChannelStatusSchema.safeParse({
      channelType: 'telegram',
      accountId: 'bot123',
      status: 'error',
    })
    expect(result.success).toBe(false)
  })

  it('accepts reconnecting status', () => {
    const result = nativeChannelStatusSchema.safeParse({
      channelType: 'discord',
      accountId: 'ws789',
      status: 'reconnecting',
    })
    expect(result.success).toBe(true)
  })

  it('accepts stopped status', () => {
    const result = nativeChannelStatusSchema.safeParse({
      channelType: 'whatsapp',
      accountId: 'num123',
      status: 'stopped',
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional lastMessageAt', () => {
    const result = nativeChannelStatusSchema.safeParse({
      channelType: 'telegram',
      accountId: 'bot123',
      status: 'connected',
      lastMessageAt: '2026-03-30T12:00:00Z',
    })
    expect(result.success).toBe(true)
  })
})

describe('governanceActionSchema', () => {
  it('accepts pause_channel with required fields', () => {
    const result = governanceActionSchema.safeParse({
      type: 'pause_channel',
      channelType: 'telegram',
      accountId: 'bot123',
    })
    expect(result.success).toBe(true)
  })

  it('accepts resume_channel with required fields', () => {
    const result = governanceActionSchema.safeParse({
      type: 'resume_channel',
      channelType: 'discord',
      accountId: 'srv456',
    })
    expect(result.success).toBe(true)
  })

  it('accepts stop_all_channels without channel/account', () => {
    const result = governanceActionSchema.safeParse({
      type: 'stop_all_channels',
    })
    expect(result.success).toBe(true)
  })

  it('rejects pause_channel without channelType', () => {
    const result = governanceActionSchema.safeParse({
      type: 'pause_channel',
      accountId: 'bot123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects resume_channel without accountId', () => {
    const result = governanceActionSchema.safeParse({
      type: 'resume_channel',
      channelType: 'telegram',
    })
    expect(result.success).toBe(false)
  })
})

describe('heartbeatSchema — nativeChannels extension', () => {
  const baseHeartbeat = {
    runtimeId: VALID_UUID,
    generation: 1,
    cpuPercent: 50,
    ramPercent: 60,
    diskPercent: 30,
    pendingEvents: 0,
    deadLetters: 0,
    openclawVersion: '1.0.0',
    agentCount: 2,
    uptimeSeconds: 3600,
  }

  it('accepts heartbeat without nativeChannels', () => {
    const result = heartbeatSchema.safeParse(baseHeartbeat)
    expect(result.success).toBe(true)
  })

  it('accepts heartbeat with nativeChannels', () => {
    const result = heartbeatSchema.safeParse({
      ...baseHeartbeat,
      nativeChannels: [
        { channelType: 'telegram', accountId: 'bot1', status: 'connected' },
        { channelType: 'discord', accountId: 'srv1', status: 'error', errorMessage: 'Timeout' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects nativeChannels exceeding 20 entries', () => {
    const channels = Array.from({ length: 21 }, (_, i) => ({
      channelType: 'telegram',
      accountId: `bot_${i}`,
      status: 'connected' as const,
    }))
    const result = heartbeatSchema.safeParse({
      ...baseHeartbeat,
      nativeChannels: channels,
    })
    expect(result.success).toBe(false)
  })

  it('accepts exactly 20 nativeChannels', () => {
    const channels = Array.from({ length: 20 }, (_, i) => ({
      channelType: 'telegram',
      accountId: `bot_${i}`,
      status: 'connected' as const,
    }))
    const result = heartbeatSchema.safeParse({
      ...baseHeartbeat,
      nativeChannels: channels,
    })
    expect(result.success).toBe(true)
  })

  it('accepts heartbeat with shutdown status', () => {
    const result = heartbeatSchema.safeParse({
      ...baseHeartbeat,
      status: 'shutdown',
    })
    expect(result.success).toBe(true)
  })
})
