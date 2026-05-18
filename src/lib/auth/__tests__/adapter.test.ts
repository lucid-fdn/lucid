import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

const mockLocalProvider = { verifyToken: vi.fn(), getExternalId: vi.fn(), tokenCookieNames: ['sb-access-token'] }
const mockPrivyProvider = { verifyToken: vi.fn(), getExternalId: vi.fn(), tokenCookieNames: ['privy-token'] }

vi.mock('../providers/local', () => ({
  LocalAuthProvider: class {
    verifyToken = mockLocalProvider.verifyToken
    getExternalId = mockLocalProvider.getExternalId
    tokenCookieNames = mockLocalProvider.tokenCookieNames
    static _instance = mockLocalProvider
    constructor() {
      return mockLocalProvider
    }
  },
}))

vi.mock('../providers/privy', () => ({
  PrivyAuthProvider: class {
    verifyToken = mockPrivyProvider.verifyToken
    getExternalId = mockPrivyProvider.getExternalId
    tokenCookieNames = mockPrivyProvider.tokenCookieNames
    constructor() {
      return mockPrivyProvider
    }
  },
}))

import { getAuthProviderType, getAuthProvider, resetAuthProvider } from '../adapter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalEnv = { ...process.env }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth adapter', () => {
  beforeEach(() => {
    resetAuthProvider()
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // -----------------------------------------------------------------------
  // getAuthProviderType
  // -----------------------------------------------------------------------
  describe('getAuthProviderType', () => {
    it('returns "local" when AUTH_PROVIDER=local', () => {
      process.env.AUTH_PROVIDER = 'local'
      expect(getAuthProviderType()).toBe('local')
    })

    it('returns "privy" when AUTH_PROVIDER=privy', () => {
      process.env.AUTH_PROVIDER = 'privy'
      expect(getAuthProviderType()).toBe('privy')
    })

    it('auto-detects "privy" when NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET are present', () => {
      delete process.env.AUTH_PROVIDER
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app-id'
      process.env.PRIVY_APP_SECRET = 'test-secret'
      expect(getAuthProviderType()).toBe('privy')
    })

    it('defaults to "local" when no env vars are set', () => {
      delete process.env.AUTH_PROVIDER
      delete process.env.NEXT_PUBLIC_PRIVY_APP_ID
      delete process.env.PRIVY_APP_SECRET
      expect(getAuthProviderType()).toBe('local')
    })

    it('warns on unknown AUTH_PROVIDER value and falls back to auto-detect', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      process.env.AUTH_PROVIDER = 'unknown-provider'
      delete process.env.NEXT_PUBLIC_PRIVY_APP_ID
      delete process.env.PRIVY_APP_SECRET

      const result = getAuthProviderType()

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown AUTH_PROVIDER "unknown-provider"'),
      )
      // Falls through to auto-detect, no Privy vars → local
      expect(result).toBe('local')
      warnSpy.mockRestore()
    })

    it('warns on unknown AUTH_PROVIDER but auto-detects privy if credentials exist', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      process.env.AUTH_PROVIDER = 'banana'
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app-id'
      process.env.PRIVY_APP_SECRET = 'test-secret'

      const result = getAuthProviderType()

      expect(warnSpy).toHaveBeenCalled()
      expect(result).toBe('privy')
      warnSpy.mockRestore()
    })
  })

  // -----------------------------------------------------------------------
  // getAuthProvider
  // -----------------------------------------------------------------------
  describe('getAuthProvider', () => {
    it('returns a LocalAuthProvider when type is local', async () => {
      process.env.AUTH_PROVIDER = 'local'
      const provider = await getAuthProvider()
      expect(provider).toBe(mockLocalProvider)
    })

    it('returns a PrivyAuthProvider when type is privy', async () => {
      process.env.AUTH_PROVIDER = 'privy'
      const provider = await getAuthProvider()
      expect(provider).toBe(mockPrivyProvider)
    })

    it('caches the provider singleton', async () => {
      process.env.AUTH_PROVIDER = 'local'
      const first = await getAuthProvider()
      const second = await getAuthProvider()
      expect(first).toBe(second)
    })

    it('returns a fresh instance after resetAuthProvider()', async () => {
      process.env.AUTH_PROVIDER = 'local'
      const first = await getAuthProvider()
      resetAuthProvider()

      // Switch to privy
      process.env.AUTH_PROVIDER = 'privy'
      const second = await getAuthProvider()

      expect(first).toBe(mockLocalProvider)
      expect(second).toBe(mockPrivyProvider)
    })
  })

  // -----------------------------------------------------------------------
  // resetAuthProvider
  // -----------------------------------------------------------------------
  describe('resetAuthProvider', () => {
    it('clears the cached provider', async () => {
      process.env.AUTH_PROVIDER = 'local'
      await getAuthProvider()

      resetAuthProvider()

      // After reset, changing env should yield different provider
      process.env.AUTH_PROVIDER = 'privy'
      const provider = await getAuthProvider()
      expect(provider).toBe(mockPrivyProvider)
    })
  })
})
