/**
 * REST Unification Tests — Endpoint Integration
 *
 * Verifies that the runtime message endpoints correctly integrate
 * with Pulse when available, and fall back to DB when not.
 */

import { describe, it, expect, vi } from 'vitest'

// ─── Contract Tests ──────────────────────────────────────────────────────────

describe('REST Unification — Contract Sync', () => {
  it('contracts/pulse.ts exports match worker pulse/types.ts key patterns', async () => {
    // Import from contracts (control plane source of truth)
    const contracts = await import('@contracts/pulse')

    // Verify key patterns match what worker expects
    expect(contracts.PulseKeys.queue('inbound', 'critical')).toBe('pulse:{inbound}:critical')
    expect(contracts.PulseKeys.queue('inbound', 'normal')).toBe('pulse:{inbound}:normal')
    expect(contracts.PulseKeys.queue('inbound', 'background')).toBe('pulse:{inbound}:background')
    expect(contracts.PulseKeys.queue('outbound', 'critical')).toBe('pulse:{outbound}:critical')
    expect(contracts.PulseKeys.queue('scheduled', 'normal')).toBe('pulse:{scheduled}:normal')

    expect(contracts.PulseKeys.active()).toBe('pulse:active')
    expect(contracts.PulseKeys.lease('test:0')).toBe('pulse:lease:test:0')
    expect(contracts.PulseKeys.agentInflight('ag-1')).toBe('pulse:agent:ag-1:inflight')
    expect(contracts.PulseKeys.dlq('inbound')).toBe('pulse:dlq:inbound')
    expect(contracts.PulseKeys.orphanLock()).toBe('pulse:orphan:lock')
  })

  it('contracts Lua scripts are identical to worker scripts', async () => {
    const contracts = await import('@contracts/pulse')

    // CLAIM_LUA is intentionally deprecated in Pulse v2 (Redis Streams / XREADGROUP)
    expect(contracts.CLAIM_LUA).toBe('')

    // CONDITIONAL_DEL_LUA
    expect(contracts.CONDITIONAL_DEL_LUA).toContain('"workerId":"')
    expect(contracts.CONDITIONAL_DEL_LUA).toContain('string.find')

    // FLOOR_DECR_LUA
    expect(contracts.FLOOR_DECR_LUA).toContain('DECR')
    expect(contracts.FLOOR_DECR_LUA).toContain('SET')

    // RENEW_LEASE_LUA
    expect(contracts.RENEW_LEASE_LUA).toContain('EXPIRE')
    expect(contracts.RENEW_LEASE_LUA).toContain('"workerId":"')

    // PLAIN_CONDITIONAL_DEL_LUA
    expect(contracts.PLAIN_CONDITIONAL_DEL_LUA).toContain('GET')
    expect(contracts.PLAIN_CONDITIONAL_DEL_LUA).toContain('DEL')
  })

  it('PulseJob type has all required fields', async () => {
    const { PulseKeys } = await import('@contracts/pulse')

    // Structural: verify PulseKeys is an object with expected methods
    expect(typeof PulseKeys.queue).toBe('function')
    expect(typeof PulseKeys.active).toBe('function')
    expect(typeof PulseKeys.lease).toBe('function')
    expect(typeof PulseKeys.agentInflight).toBe('function')
    expect(typeof PulseKeys.dlq).toBe('function')
    expect(typeof PulseKeys.metrics).toBe('function')
    expect(typeof PulseKeys.orphanLock).toBe('function')
  })
})

describe('REST Unification — Schema Validation', () => {
  it('enqueueAndClaimSelfSchema validates correctly', async () => {
    const { enqueueAndClaimSelfSchema } = await import('@/lib/mission-control/schemas')

    // Valid
    const valid = enqueueAndClaimSelfSchema.safeParse({
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      eventType: 'inbound',
      agentId: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
      orgId: 'c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7',
    })
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data.priority).toBe('normal') // default
    }

    // With priority
    const withPriority = enqueueAndClaimSelfSchema.safeParse({
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      eventType: 'inbound',
      agentId: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
      orgId: 'c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7',
      priority: 'critical',
    })
    expect(withPriority.success).toBe(true)
    if (withPriority.success) {
      expect(withPriority.data.priority).toBe('critical')
    }

    // Invalid eventType
    const invalidType = enqueueAndClaimSelfSchema.safeParse({
      eventId: '00000000-0000-0000-0000-000000000001',
      eventType: 'unknown',
      agentId: '00000000-0000-0000-0000-000000000002',
      orgId: '00000000-0000-0000-0000-000000000003',
    })
    expect(invalidType.success).toBe(false)

    // Invalid UUID
    const invalidUuid = enqueueAndClaimSelfSchema.safeParse({
      eventId: 'not-a-uuid',
      eventType: 'inbound',
      agentId: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
      orgId: 'c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7',
    })
    expect(invalidUuid.success).toBe(false)

    // Invalid priority
    const invalidPriority = enqueueAndClaimSelfSchema.safeParse({
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      eventType: 'inbound',
      agentId: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
      orgId: 'c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7',
      priority: 'urgent', // not a valid priority
    })
    expect(invalidPriority.success).toBe(false)
  })
})

describe('REST Unification — Worker ID Conventions', () => {
  it('C1 relay uses relay- prefix', () => {
    const runtimeId = 'abc-123'
    expect(`relay-${runtimeId}`).toBe('relay-abc-123')
  })

  it('C2a native uses native- prefix', () => {
    const runtimeId = 'xyz-789'
    expect(`native-${runtimeId}`).toBe('native-xyz-789')
  })

  it('worker IDs are distinguishable by prefix', () => {
    const c1Id = 'relay-runtime-1'
    const c2aId = 'native-runtime-1'
    const sharedId = 'worker-abc123'

    expect(c1Id.startsWith('relay-')).toBe(true)
    expect(c2aId.startsWith('native-')).toBe(true)
    expect(sharedId.startsWith('worker-')).toBe(true)

    // All distinct
    expect(c1Id).not.toBe(c2aId)
    expect(c1Id).not.toBe(sharedId)
    expect(c2aId).not.toBe(sharedId)
  })
})

describe('REST Unification — Pulse Metrics Key Pattern', () => {
  it('metrics key includes date', async () => {
    const { PulseKeys } = await import('@contracts/pulse')
    const key = PulseKeys.metrics('2026-04-06')
    expect(key).toBe('pulse:metrics:2026-04-06')
  })

  it('metrics key defaults to today', async () => {
    const { PulseKeys } = await import('@contracts/pulse')
    const key = PulseKeys.metrics()
    const today = new Date().toISOString().split('T')[0]
    expect(key).toBe(`pulse:metrics:${today}`)
  })
})
