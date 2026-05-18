import { describe, it, expect, vi } from 'vitest'

// Mock server-only (not available in test environment)
vi.mock('server-only', () => ({}))

import { deriveHealthStatus, type ConnectionHealth } from '../integration-health'

function makeConn(overrides: Partial<ConnectionHealth> = {}): ConnectionHealth {
  return {
    id: 'test-id',
    connection_id: 'conn-1',
    auth_provider: 'slack',
    status: 'active',
    expires_at: null,
    last_used_at: null,
    disconnected_at: null,
    metadata: {},
    ...overrides,
  }
}

describe('deriveHealthStatus', () => {
  it('returns null for undefined connection', () => {
    const result = deriveHealthStatus(undefined)
    expect(result.health_status).toBeNull()
    expect(result.health_message).toBeNull()
    expect(result.expires_at).toBeNull()
  })

  it('returns healthy for active connection without expiry', () => {
    const result = deriveHealthStatus(makeConn())
    expect(result.health_status).toBe('healthy')
    expect(result.health_message).toBeNull()
  })

  it('returns healthy for active connection with far-future expiry', () => {
    const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    const result = deriveHealthStatus(makeConn({ expires_at: farFuture }))
    expect(result.health_status).toBe('healthy')
    expect(result.expires_at).toBe(farFuture)
  })

  it('returns expiring for active connection expiring within 7 days', () => {
    const in3days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const result = deriveHealthStatus(makeConn({ expires_at: in3days }))
    expect(result.health_status).toBe('expiring')
    expect(result.health_message).toMatch(/expires in \d+ day/)
  })

  it('returns expired for active connection with past expiry', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const result = deriveHealthStatus(makeConn({ expires_at: past }))
    expect(result.health_status).toBe('expired')
    expect(result.health_message).toContain('expired')
  })

  it('returns expired for connection with status expired', () => {
    const result = deriveHealthStatus(makeConn({ status: 'expired' }))
    expect(result.health_status).toBe('expired')
    expect(result.health_message).toContain('expired')
  })

  it('returns error for revoked connection', () => {
    const result = deriveHealthStatus(makeConn({ status: 'revoked' }))
    expect(result.health_status).toBe('error')
    expect(result.health_message).toContain('revoked')
  })

  it('returns error with message for error connection', () => {
    const result = deriveHealthStatus(
      makeConn({ status: 'error', metadata: { last_error_message: 'API rate limit exceeded' } }),
    )
    expect(result.health_status).toBe('error')
    expect(result.health_message).toBe('API rate limit exceeded')
  })

  it('uses custom warning days threshold', () => {
    const in2days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    // Default 7 days → expiring
    expect(deriveHealthStatus(makeConn({ expires_at: in2days })).health_status).toBe('expiring')
    // 1 day threshold → healthy (2 days > 1 day)
    expect(deriveHealthStatus(makeConn({ expires_at: in2days }), 1).health_status).toBe('healthy')
  })

  it('returns correct days count in message', () => {
    const in1day = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
    const result = deriveHealthStatus(makeConn({ expires_at: in1day }))
    expect(result.health_message).toMatch(/1 day$/)
  })
})
