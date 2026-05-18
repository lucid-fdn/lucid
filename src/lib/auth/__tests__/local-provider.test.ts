import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

const mockResolveInternalUserId = vi.fn()
vi.mock('../providers/resolve-user', () => ({
  resolveInternalUserId: (...args: unknown[]) => mockResolveInternalUserId(...args),
}))

import { LocalAuthProvider } from '../providers/local'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'test-jwt-secret-for-unit-tests'
const originalEnv = { ...process.env }

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url')
}

function createValidJwt(
  payload: Record<string, unknown>,
  secret: string = TEST_JWT_SECRET,
): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const signature = createHmac('sha256', secret).update(data).digest('base64url')
  return `${header}.${body}.${signature}`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalAuthProvider', () => {
  let provider: LocalAuthProvider

  beforeEach(() => {
    provider = new LocalAuthProvider()
    process.env.JWT_SECRET = TEST_JWT_SECRET
    mockResolveInternalUserId.mockReset()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // -----------------------------------------------------------------------
  // tokenCookieNames
  // -----------------------------------------------------------------------
  describe('tokenCookieNames', () => {
    it('contains the correct cookie names', () => {
      expect(provider.tokenCookieNames).toEqual([
        'sb-access-token',
        'sb-auth-token',
        'lucid-auth-token',
      ])
    })
  })

  // -----------------------------------------------------------------------
  // verifyToken
  // -----------------------------------------------------------------------
  describe('verifyToken', () => {
    it('succeeds with a valid JWT and resolves internal user ID', async () => {
      const token = createValidJwt({
        sub: 'user-uuid-123',
        email: 'test@example.com',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
      mockResolveInternalUserId.mockResolvedValue('internal-uuid-456')

      const result = await provider.verifyToken(token)

      expect(result).toEqual({
        userId: 'internal-uuid-456',
        externalId: 'local:user-uuid-123',
      })
      expect(mockResolveInternalUserId).toHaveBeenCalledWith({
        provider: 'local',
        externalId: 'user-uuid-123',
        email: 'test@example.com',
      })
    })

    it('returns null for an invalid signature', async () => {
      const token = createValidJwt(
        { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 },
        'wrong-secret',
      )

      const result = await provider.verifyToken(token)
      expect(result).toBeNull()
    })

    it('returns null for an expired token', async () => {
      const token = createValidJwt({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) - 100, // expired 100s ago
      })

      const result = await provider.verifyToken(token)
      expect(result).toBeNull()
    })

    it('returns null for a malformed token (not 3 parts)', async () => {
      const result = await provider.verifyToken('only-two.parts')
      expect(result).toBeNull()
    })

    it('returns null for a completely invalid token', async () => {
      const result = await provider.verifyToken('not-a-jwt-at-all')
      expect(result).toBeNull()
    })

    it('returns null when JWT_SECRET is not set', async () => {
      delete process.env.JWT_SECRET

      const token = createValidJwt({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      const result = await provider.verifyToken(token)
      expect(result).toBeNull()
    })

    it('returns null when resolveInternalUserId returns null', async () => {
      const token = createValidJwt({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
      mockResolveInternalUserId.mockResolvedValue(null)

      const result = await provider.verifyToken(token)
      expect(result).toBeNull()
    })

    it('returns null when payload has no sub claim', async () => {
      const token = createValidJwt({
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      const result = await provider.verifyToken(token)
      expect(result).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // getExternalId
  // -----------------------------------------------------------------------
  describe('getExternalId', () => {
    it('returns local:{sub} format for a valid token', async () => {
      const token = createValidJwt({
        sub: 'gotrue-user-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      const result = await provider.getExternalId(token)
      expect(result).toBe('local:gotrue-user-abc')
    })

    it('returns null for an invalid token', async () => {
      const result = await provider.getExternalId('invalid.token.here')
      expect(result).toBeNull()
    })

    it('returns null for an expired token', async () => {
      const token = createValidJwt({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) - 100,
      })

      const result = await provider.getExternalId(token)
      expect(result).toBeNull()
    })
  })
})
