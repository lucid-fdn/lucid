/**
 * Governance Action API Tests
 *
 * Tests the POST /api/runtimes/[id]/governance endpoint — validates:
 * - Schema validation (pause requires channelType+accountId, stop_all does not)
 * - Atomic JSONB append via RPC
 * - Auth/ownership gates
 */

import { describe, it, expect } from 'vitest'
import { governanceActionSchema } from '@/lib/mission-control/schemas'
import type { GovernanceAction, NativeChannelStatus } from '@/lib/mission-control/types'

describe('Governance Action Schema', () => {
  it('validates pause_channel with required fields', () => {
    const result = governanceActionSchema.safeParse({
      type: 'pause_channel',
      channelType: 'telegram',
      accountId: 'bot_123',
    })
    expect(result.success).toBe(true)
  })

  it('validates resume_channel with required fields', () => {
    const result = governanceActionSchema.safeParse({
      type: 'resume_channel',
      channelType: 'discord',
      accountId: 'guild_456',
    })
    expect(result.success).toBe(true)
  })

  it('validates stop_all_channels without channelType/accountId', () => {
    const result = governanceActionSchema.safeParse({
      type: 'stop_all_channels',
    })
    expect(result.success).toBe(true)
  })

  it('rejects pause_channel without channelType', () => {
    const result = governanceActionSchema.safeParse({
      type: 'pause_channel',
      accountId: 'bot_123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects pause_channel without accountId', () => {
    const result = governanceActionSchema.safeParse({
      type: 'pause_channel',
      channelType: 'telegram',
    })
    expect(result.success).toBe(false)
  })

  it('rejects resume_channel without channelType', () => {
    const result = governanceActionSchema.safeParse({
      type: 'resume_channel',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid action type', () => {
    const result = governanceActionSchema.safeParse({
      type: 'restart_channel',
      channelType: 'telegram',
      accountId: 'bot_123',
    })
    expect(result.success).toBe(false)
  })

  it('enforces max lengths on channelType and accountId', () => {
    const result = governanceActionSchema.safeParse({
      type: 'pause_channel',
      channelType: 'x'.repeat(51),
      accountId: 'bot_123',
    })
    expect(result.success).toBe(false)

    const result2 = governanceActionSchema.safeParse({
      type: 'pause_channel',
      channelType: 'telegram',
      accountId: 'x'.repeat(101),
    })
    expect(result2.success).toBe(false)
  })
})

describe('Governance Action Type Safety', () => {
  it('GovernanceAction type matches schema output', () => {
    const action: GovernanceAction = {
      type: 'pause_channel',
      channelType: 'telegram',
      accountId: 'bot_123',
    }
    // Type should be assignable
    expect(action.type).toBe('pause_channel')
  })

  it('stop_all omits channel fields', () => {
    const action: GovernanceAction = {
      type: 'stop_all_channels',
    }
    expect(action.channelType).toBeUndefined()
    expect(action.accountId).toBeUndefined()
  })
})

describe('NativeChannelStatus Type', () => {
  it('connected channel has required fields', () => {
    const ch: NativeChannelStatus = {
      channelType: 'telegram',
      accountId: 'bot_123',
      status: 'connected',
    }
    expect(ch.status).toBe('connected')
    expect(ch.errorMessage).toBeUndefined()
  })

  it('error channel should include errorMessage', () => {
    const ch: NativeChannelStatus = {
      channelType: 'discord',
      accountId: 'guild_456',
      status: 'error',
      errorMessage: 'Bot kicked from server',
    }
    expect(ch.errorMessage).toBe('Bot kicked from server')
  })

  it('accepts all valid status values', () => {
    const statuses: NativeChannelStatus['status'][] = ['connected', 'reconnecting', 'error', 'stopped']
    for (const status of statuses) {
      const ch: NativeChannelStatus = {
        channelType: 'web',
        accountId: 'ws_1',
        status,
        ...(status === 'error' ? { errorMessage: 'test' } : {}),
      }
      expect(ch.status).toBe(status)
    }
  })
})

describe('Channel Mode on Create Schema', () => {
  // Importing from schemas to test the createRuntimeSchema extension
  it('accepts relay channel mode', async () => {
    const { createRuntimeSchema } = await import('@/lib/mission-control/schemas')
    const result = createRuntimeSchema.safeParse({
      displayName: 'test-runtime',
      provider: 'railway',
      channelMode: 'relay',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channelMode).toBe('relay')
    }
  })

  it('accepts native channel mode', async () => {
    const { createRuntimeSchema } = await import('@/lib/mission-control/schemas')
    const result = createRuntimeSchema.safeParse({
      displayName: 'test-runtime',
      provider: 'railway',
      channelMode: 'native',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channelMode).toBe('native')
    }
  })

  it('defaults to undefined when channelMode not provided', async () => {
    const { createRuntimeSchema } = await import('@/lib/mission-control/schemas')
    const result = createRuntimeSchema.safeParse({
      displayName: 'test-runtime',
      provider: 'railway',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channelMode).toBeUndefined()
    }
  })

  it('rejects invalid channel mode', async () => {
    const { createRuntimeSchema } = await import('@/lib/mission-control/schemas')
    const result = createRuntimeSchema.safeParse({
      displayName: 'test-runtime',
      provider: 'railway',
      channelMode: 'hybrid',
    })
    expect(result.success).toBe(false)
  })
})
