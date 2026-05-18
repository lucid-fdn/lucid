/**
 * Tests for validateBotFrameworkJwt().
 *
 * We mock jose's jwtVerify and createRemoteJWKSet to test each validation
 * path without hitting Microsoft's real JWKS endpoint.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock server-only (not available in test environment)
vi.mock('server-only', () => ({}))

// Mock jose before importing the module under test
const mockJwtVerify = vi.fn()
const mockCreateRemoteJWKSet = vi.fn(() => 'mock-jwks')

vi.mock('jose', () => ({
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
  createRemoteJWKSet: (...args: unknown[]) => mockCreateRemoteJWKSet(...args),
}))

// Must import after mocks are set up
const { validateBotFrameworkJwt } = await import('../msteams/jwt-validator')

describe('validateBotFrameworkJwt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateRemoteJWKSet.mockReturnValue('mock-jwks')
  })

  it('returns invalid when Authorization header is missing', async () => {
    const result = await validateBotFrameworkJwt(null, 'app-id')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Missing Authorization header')
  })

  it('returns invalid when header is not Bearer format', async () => {
    const result = await validateBotFrameworkJwt('Basic abc123', 'app-id')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid Authorization header format')
  })

  it('returns invalid for empty Bearer token', async () => {
    const result = await validateBotFrameworkJwt('Bearer ', 'app-id')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid Authorization header format')
  })

  it('skips JWT validation when expectedAudience is null (backwards compat)', async () => {
    const result = await validateBotFrameworkJwt('Bearer some.jwt.token', null)
    expect(result.valid).toBe(true)
    expect(mockJwtVerify).not.toHaveBeenCalled()
  })

  it('returns valid with payload on successful verification', async () => {
    const mockPayload = { iss: 'https://api.botframework.com', aud: 'app-id', sub: 'bot' }
    mockJwtVerify.mockResolvedValue({ payload: mockPayload })

    const result = await validateBotFrameworkJwt('Bearer valid.jwt.token', 'app-id')
    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(mockPayload)
    expect(mockJwtVerify).toHaveBeenCalledWith(
      'valid.jwt.token',
      'mock-jwks',
      { issuer: 'https://api.botframework.com', audience: 'app-id' },
    )
  })

  it('retries with fresh JWKS on "no applicable key" error (key rotation)', async () => {
    const callsBefore = mockCreateRemoteJWKSet.mock.calls.length
    const rotatedPayload = { iss: 'https://api.botframework.com', aud: 'app-id' }
    mockJwtVerify
      .mockRejectedValueOnce(new Error('no applicable key found'))
      .mockResolvedValueOnce({ payload: rotatedPayload })

    const result = await validateBotFrameworkJwt('Bearer rotated.jwt.token', 'app-id')
    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(rotatedPayload)
    // Should have created a fresh JWKS instance for the retry
    expect(mockCreateRemoteJWKSet.mock.calls.length - callsBefore).toBe(1)
    expect(mockJwtVerify).toHaveBeenCalledTimes(2)
  })

  it('returns invalid after key rotation retry fails', async () => {
    mockJwtVerify
      .mockRejectedValueOnce(new Error('no applicable key found'))
      .mockRejectedValueOnce(new Error('still no applicable key'))

    const result = await validateBotFrameworkJwt('Bearer bad.jwt.token', 'app-id')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('after key refresh')
    expect(result.error).toContain('still no applicable key')
  })

  it('returns invalid on issuer mismatch', async () => {
    mockJwtVerify.mockRejectedValue(new Error('"iss" claim check failed'))

    const result = await validateBotFrameworkJwt('Bearer wrong-issuer.jwt', 'app-id')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('iss')
  })

  it('returns invalid on expired token', async () => {
    mockJwtVerify.mockRejectedValue(new Error('"exp" claim timestamp check failed'))

    const result = await validateBotFrameworkJwt('Bearer expired.jwt', 'app-id')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('exp')
  })

  it('handles case-insensitive Bearer prefix', async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: 'bot' } })

    const result = await validateBotFrameworkJwt('bearer valid.jwt.token', 'app-id')
    expect(result.valid).toBe(true)
  })
})
