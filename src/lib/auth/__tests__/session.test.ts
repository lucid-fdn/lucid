import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

const mockCookieGet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (...args: unknown[]) => mockCookieGet(...args),
  }),
}))

const mockVerifyToken = vi.fn()
const mockGetExternalId = vi.fn()
const mockGetAuthProvider = vi.fn().mockResolvedValue({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
  getExternalId: (...args: unknown[]) => mockGetExternalId(...args),
  tokenCookieNames: ['sb-access-token', 'sb-auth-token', 'lucid-auth-token'],
})
const mockGetAuthProviderType = vi.fn().mockReturnValue('local')
const mockGetAuthTokenCookieNames = vi.fn().mockReturnValue(['sb-access-token', 'sb-auth-token', 'lucid-auth-token'])

function signedE2ECookie(userId: string, secret: string): string {
  const expiresAt = Date.now() + 60_000
  const payload = `${userId}:${expiresAt}`
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return Buffer.from(JSON.stringify({ userId, expiresAt, signature })).toString('base64url')
}

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[key] = value
  } else {
    delete process.env[key]
  }
}

vi.mock('../adapter', () => ({
  getAuthProvider: (...args: unknown[]) => mockGetAuthProvider(...args),
  getAuthProviderType: (...args: unknown[]) => mockGetAuthProviderType(...args),
  getAuthTokenCookieNames: (...args: unknown[]) => mockGetAuthTokenCookieNames(...args),
}))

const mockCacheStoreGet = vi.fn()
const mockCacheStoreSet = vi.fn()
vi.mock('../cache', () => ({
  cacheStore: {
    get: (...args: unknown[]) => mockCacheStoreGet(...args),
    set: (...args: unknown[]) => mockCacheStoreSet(...args),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}))

const mockCaptureException = vi.fn()
const mockSetUser = vi.fn()
const mockClearUser = vi.fn()
vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    setUser: (...args: unknown[]) => mockSetUser(...args),
    clearUser: (...args: unknown[]) => mockClearUser(...args),
  },
}))

vi.mock('@/lib/cache/config', () => ({
  TTL: {
    AUTH: 3600,
    SHORT: 60,
    MEDIUM: 300,
    LONG: 3600,
  },
}))

vi.mock('@/lib/errors/types', () => ({
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'AuthenticationError'
    }
  },
}))

import {
  getServerSession,
  requireUserId,
  requireExternalId,
} from '../session'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('session module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheStoreGet.mockResolvedValue(null)
    mockCacheStoreSet.mockResolvedValue(undefined)
    mockCaptureException.mockImplementation(() => {})
    mockSetUser.mockImplementation(() => {})
    mockClearUser.mockImplementation(() => {})
    mockGetAuthProviderType.mockReturnValue('local')
    mockGetAuthTokenCookieNames.mockReturnValue(['sb-access-token', 'sb-auth-token', 'lucid-auth-token'])
  })

  // -----------------------------------------------------------------------
  // getServerSession
  // -----------------------------------------------------------------------
  describe('getServerSession', () => {
    it('returns userId from a valid token', async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'valid-token-123' }
        return undefined
      })
      mockVerifyToken.mockResolvedValue({
        userId: 'internal-user-uuid',
        externalId: 'local:gotrue-uuid',
      })

      const session = await getServerSession()

      expect(session.userId).toBe('internal-user-uuid')
      expect(mockVerifyToken).toHaveBeenCalledWith('valid-token-123')
    })

    it('returns null userId when no cookie is present', async () => {
      mockCookieGet.mockReturnValue(undefined)

      const session = await getServerSession()

      expect(session.userId).toBeNull()
      expect(mockVerifyToken).not.toHaveBeenCalled()
    })

    it('caches session result by token hash', async () => {
      const cachedSession = { userId: 'cached-user-id' }
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'token-abc' }
        return undefined
      })
      mockCacheStoreGet.mockResolvedValue(cachedSession)

      const session = await getServerSession()

      expect(session).toEqual(cachedSession)
      // Should NOT call verifyToken since cache hit
      expect(mockVerifyToken).not.toHaveBeenCalled()
      // Should have called cacheStore.get with a session: prefixed key
      expect(mockCacheStoreGet).toHaveBeenCalledWith(
        expect.stringMatching(/^session:[0-9a-f]{64}$/),
      )
    })

    it('stores session in cache after verification', async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'fresh-token' }
        return undefined
      })
      mockCacheStoreGet.mockResolvedValue(null)
      mockVerifyToken.mockResolvedValue({
        userId: 'new-user-id',
        externalId: 'local:ext-id',
      })

      await getServerSession()

      expect(mockCacheStoreSet).toHaveBeenCalledWith(
        expect.stringMatching(/^session:/),
        expect.objectContaining({ userId: 'new-user-id' }),
        3600, // TTL.AUTH
      )
    })

    it('returns null userId when verifyToken returns null', async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'bad-token' }
        return undefined
      })
      mockVerifyToken.mockResolvedValue(null)

      const session = await getServerSession()

      expect(session.userId).toBeNull()
    })

    it('returns null userId and captures error on provider failure', async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'some-token' }
        return undefined
      })
      mockVerifyToken.mockRejectedValue(new Error('Provider crashed'))

      const session = await getServerSession()

      expect(session.userId).toBeNull()
      expect(mockCaptureException).toHaveBeenCalled()
    })

    it('sets error tracking user context on success', async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'ok-token' }
        return undefined
      })
      mockVerifyToken.mockResolvedValue({
        userId: 'tracked-user',
        externalId: 'local:ext',
      })

      await getServerSession()

      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'tracked-user',
        username: 'tracked-user',
      })
    })

    it('tries fallback cookie names', async () => {
      // First cookie returns nothing, second returns a token
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-auth-token') return { value: 'fallback-token' }
        return undefined
      })
      mockVerifyToken.mockResolvedValue({
        userId: 'fallback-user',
        externalId: 'local:ext',
      })

      const session = await getServerSession()

      expect(session.userId).toBe('fallback-user')
      expect(mockVerifyToken).toHaveBeenCalledWith('fallback-token')
    })

    it('accepts signed e2e auth in Vercel preview', async () => {
      const previousNodeEnv = process.env.NODE_ENV
      const previousVercelEnv = process.env.VERCEL_ENV
      const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      process.env.NODE_ENV = 'production'
      process.env.VERCEL_ENV = 'preview'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'preview-service-role-secret'
      const cookieValue = signedE2ECookie('preview-user-id', 'preview-service-role-secret')

      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'lucid-e2e-auth') return { value: cookieValue }
        return undefined
      })

      try {
        const session = await getServerSession()
        expect(session.userId).toBe('preview-user-id')
        expect(mockVerifyToken).not.toHaveBeenCalled()
      } finally {
        restoreEnv('NODE_ENV', previousNodeEnv)
        restoreEnv('VERCEL_ENV', previousVercelEnv)
        restoreEnv('SUPABASE_SERVICE_ROLE_KEY', previousServiceRoleKey)
      }
    })

    it('does not accept service-role signed e2e auth in production', async () => {
      const previousNodeEnv = process.env.NODE_ENV
      const previousVercelEnv = process.env.VERCEL_ENV
      const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      process.env.NODE_ENV = 'production'
      delete process.env.VERCEL_ENV
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'production-service-role-secret'
      const cookieValue = signedE2ECookie('production-user-id', 'production-service-role-secret')

      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'lucid-e2e-auth') return { value: cookieValue }
        return undefined
      })

      try {
        const session = await getServerSession()
        expect(session.userId).toBeNull()
      } finally {
        restoreEnv('NODE_ENV', previousNodeEnv)
        restoreEnv('VERCEL_ENV', previousVercelEnv)
        restoreEnv('SUPABASE_SERVICE_ROLE_KEY', previousServiceRoleKey)
      }
    })
  })

  // -----------------------------------------------------------------------
  // requireUserId
  // -----------------------------------------------------------------------
  describe('requireUserId', () => {
    it('returns userId when authenticated', async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'valid-token' }
        return undefined
      })
      mockVerifyToken.mockResolvedValue({
        userId: 'auth-user-id',
        externalId: 'local:ext',
      })

      const userId = await requireUserId()
      expect(userId).toBe('auth-user-id')
    })

    it('throws AuthenticationError when not authenticated', async () => {
      mockCookieGet.mockReturnValue(undefined)

      await expect(requireUserId()).rejects.toThrow('Unauthorized')
    })

    it('captures the authentication error for tracking', async () => {
      mockCookieGet.mockReturnValue(undefined)

      await expect(requireUserId()).rejects.toThrow()
      expect(mockCaptureException).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // requireExternalId
  // -----------------------------------------------------------------------
  describe('requireExternalId', () => {
    it('returns the provider external ID', async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'ext-token' }
        return undefined
      })
      mockGetExternalId.mockResolvedValue('local:gotrue-uuid-123')

      const externalId = await requireExternalId()
      expect(externalId).toBe('local:gotrue-uuid-123')
    })

    it('throws AuthenticationError when no token is present', async () => {
      mockCookieGet.mockReturnValue(undefined)

      await expect(requireExternalId()).rejects.toThrow('Unauthorized')
    })

    it('throws AuthenticationError when getExternalId returns null', async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === 'sb-access-token') return { value: 'invalid-token' }
        return undefined
      })
      mockGetExternalId.mockResolvedValue(null)

      await expect(requireExternalId()).rejects.toThrow('Unauthorized')
    })
  })

  // -----------------------------------------------------------------------
  // requireExternalId edge cases
  // -----------------------------------------------------------------------
  describe('requireExternalId (additional)', () => {
    it('captures error for tracking when authentication fails', async () => {
      mockCookieGet.mockReturnValue(undefined)

      await expect(requireExternalId()).rejects.toThrow('Unauthorized')
      expect(mockCaptureException).toHaveBeenCalled()
    })
  })
})
