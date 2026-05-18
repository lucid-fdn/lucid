import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockResolveInternalUserId = vi.fn()

vi.mock('../providers/resolve-user', () => ({
  resolveExistingInternalUserId: vi.fn(),
  resolveInternalUserId: (...args: unknown[]) => mockResolveInternalUserId(...args),
}))

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: class MockPrivyClient {
    verifyAuthToken = vi.fn()
    getUser = vi.fn()
  },
}))

import { PrivyAuthProvider } from '../providers/privy'

describe('PrivyAuthProvider', () => {
  let provider: PrivyAuthProvider

  beforeEach(() => {
    provider = new PrivyAuthProvider()
    mockResolveInternalUserId.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('accepts the shared Lucid auth cookie name in addition to Privy cookies', () => {
    expect(provider.tokenCookieNames).toEqual([
      'lucid-auth-token',
      'privy-token',
      'privy-id-token',
      'privy-refresh-token',
    ])
  })
})
